import {mkdir,readFile,rename,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {NotificationType,OrderItem,OrderLineKind,OrderStatus,Product,ShopNotification,ShopOrder,ShopProduct,UserProfile} from '../types'
import {inventoryUsage,productUsage,round2} from '../fabrics'
import {canMoveStage,withGarmentDefaults,type GarmentFields,type ProductionStage} from '../clothing'
import {LOW_STOCK_THRESHOLD} from '../types'

export interface ProductInput {
  name:string
  stock:number
  unit:string
  imageUrl?:string
  active:boolean
  /** Optional leftover fields from older inventory records. Not written by the new form. */
  category?:Product['category']
  price?:number
  description?:string
  imageColor?:string
}

export type ProfilePatch = Partial<Omit<UserProfile,'id'|'updatedAt'>>

/** Empty profile for a user who has not saved one yet. */
export function emptyProfile(id:string):UserProfile{
  return {id,displayName:'',phone:'',address:'',birthday:'',photoUrl:''}
}

export type ShopProductInput = Omit<ShopProduct,'id'|'createdAt'|'updatedAt'|keyof GarmentFields|'colors'|'fabrics'> & Partial<GarmentFields> & {colors?:ShopProduct['colors'];fabrics?:ShopProduct['fabrics']}

export interface PlaceOrderInput {
  customerUid:string
  customerEmail:string
  customerName?:string
  items:{productId:string;qty:number;kind?:OrderLineKind;size?:string;style?:string;color?:string;fabricId?:string}[]
  note?:string
  source:'customer'|'admin'
}

export interface ShopStore {
  listProducts():Promise<Product[]>
  getProduct(id:string):Promise<Product|null>
  createProduct(data:ProductInput):Promise<Product>
  updateProduct(id:string,data:Partial<ProductInput>):Promise<Product|null>
  deleteProduct(id:string):Promise<boolean>
  listShopProducts():Promise<ShopProduct[]>
  getShopProduct(id:string):Promise<ShopProduct|null>
  createShopProduct(data:ShopProductInput):Promise<ShopProduct>
  updateShopProduct(id:string,data:Partial<ShopProductInput>):Promise<ShopProduct|null>
  deleteShopProduct(id:string):Promise<boolean>
  listOrders(filter?:{customerUid?:string;customerEmail?:string}):Promise<ShopOrder[]>
  getOrder(id:string):Promise<ShopOrder|null>
  placeOrder(input:PlaceOrderInput):Promise<ShopOrder>
  updateOrder(id:string,data:{status?:OrderStatus;note?:string}):Promise<ShopOrder|null>
  /** Move one order line to an adjacent production stage. */
  updateOrderLineProgress(id:string,lineIndex:number,stage:ProductionStage):Promise<ShopOrder|null>
  listNotifications(recipient:string,limit?:number):Promise<ShopNotification[]>
  unreadCount(recipient:string):Promise<number>
  createNotification(input:NotificationInput):Promise<ShopNotification>
  markNotificationsRead(recipient:string,ids:string[]|'all'):Promise<number>
  /** Profile by owner key ('admin' or the customer uid). Never null: unsaved = empty profile. */
  getProfile(id:string):Promise<UserProfile>
  saveProfile(id:string,patch:ProfilePatch):Promise<UserProfile>
}

export interface NotificationInput {
  recipient:string
  customerEmail?:string
  type:NotificationType
  title:string
  message:string
  link:string
}

export class StoreError extends Error {
  constructor(message:string, readonly status:number){ super(message); this.name='StoreError' }
}

/** products = admin inventory (raw materials); shopProducts = sellable products. */
interface DataFile {products:Product[];shopProducts:ShopProduct[];orders:ShopOrder[];notifications:ShopNotification[];profiles:UserProfile[]}

type OrderRequestItem={productId:string;qty:number;kind?:OrderLineKind;size?:string;style?:string;color?:string;fabricId?:string}
export function mergeQty(items:OrderRequestItem[]){
  const map=new Map<string,{productId:string;qty:number;kind:OrderLineKind;size?:string;style?:string;color?:string;fabricId?:string}>()
  for(const item of items){
    const kind:OrderLineKind=item.kind==='inventory'?'inventory':'product'
    // Same product in a different size, pattern, color or fabric is a separate line.
    const key=`${kind}:${item.productId}:${item.size||''}:${item.style||''}:${item.color||''}:${item.fabricId||''}`
    const current=map.get(key)||{productId:item.productId,qty:0,kind,...(kind==='product'?{size:item.size,style:item.style,color:item.color,fabricId:item.fabricId}:{})}
    current.qty+=item.qty
    map.set(key,current)
  }
  return [...map.values()]
}

function cloneProduct(product:ShopProduct):ShopProduct{
  const p=withGarmentDefaults(product)
  return {
    ...p,
    fabrics:(product.fabrics||[]).map(f=>({...f})),
    colors:(product.colors||[]).map(c=>({...c})),
    patternStyles:[...p.patternStyles],
    sizes:[...p.sizes],
  }
}

/** Size, pattern and color for a product line: must be one the admin offered. Missing size/pattern default to the first option. */
export function garmentChoice(product:ShopProduct,size?:string,style?:string,color?:string){
  const p=withGarmentDefaults(product)
  const colors=product.colors||[]
  const chosenSize=size||p.sizes[0]
  const chosenStyle=style||p.patternStyles[0]
  if(!p.sizes.includes(chosenSize)) throw new StoreError(`Size ${chosenSize} is not available for ${product.name}`,400)
  if(!p.patternStyles.includes(chosenStyle)) throw new StoreError(`That pattern is not available for ${product.name}`,400)
  if(colors.length){
    if(!color) throw new StoreError('Choose a color',400)
    if(!colors.some(c=>c.name===color)) throw new StoreError(`Color ${color} is not available for ${product.name}`,400)
  }
  return {clothingType:p.clothingType,size:chosenSize,style:chosenStyle,...(colors.length&&color?{color}:{})}
}

export function resolveChosenFabric(item:Product|null|undefined,required:boolean){
  if(!required&&!item) return undefined
  if(!item) throw new StoreError('Choose a fabric',400)
  if(item.active===false) throw new StoreError(`${item.name} is not available`,400)
  if(item.stock<=0) throw new StoreError(`${item.name} is out of stock`,409)
  return {inventoryItemId:item.id,name:item.name,unit:item.unit}
}

/** Shared progress-move rule for both stores. Mutates and returns the line. */
export function moveLineProgress(order:ShopOrder,lineIndex:number,stage:ProductionStage){
  if(order.status==='Cancelled') throw new StoreError('Cancelled orders cannot move through production',409)
  const line=order.items[lineIndex]
  if(!line) throw new StoreError('Order line not found',404)
  const current=line.progress||'Queued'
  if(!canMoveStage(current,stage)) throw new StoreError(`Cannot move from ${current} to ${stage}; move one step at a time`,409)
  line.progress=stage
  line.progressUpdatedAt=new Date().toISOString()
  return line
}

function cloneOrder(order:ShopOrder):ShopOrder{
  return {...order,items:order.items.map(i=>({
    ...i,
    ...(i.fabrics?{fabrics:i.fabrics.map(f=>({...f}))}:{}),
    ...(i.chosenFabric?{chosenFabric:{...i.chosenFabric}}:{}),
  }))}
}

function countsTowardRevenue(status:OrderStatus){
  return status!=='Cancelled' && status!=='Pending'
}

export function buildReports(orders:ShopOrder[], now=new Date()){
  const byStatus:Record<OrderStatus,number>={Pending:0,Paid:0,'To cut':0,Cutting:0,Ready:0,Completed:0,Cancelled:0}
  const productMap=new Map<string,{name:string;qty:number;revenue:number}>()
  const dayMap=new Map<string,number>()
  const weekMap=new Map<string,number>()
  let weekRevenue=0
  const weekAgo=new Date(now.getTime()-7*24*60*60*1000)
  for(const order of orders){
    byStatus[order.status]=(byStatus[order.status]||0)+1
    if(!countsTowardRevenue(order.status)) continue
    const created=new Date(order.createdAt||0)
    const day=(order.createdAt||'').slice(0,10)
    dayMap.set(day,(dayMap.get(day)||0)+order.total)
    const weekStart=isoWeekKey(created)
    weekMap.set(weekStart,(weekMap.get(weekStart)||0)+order.total)
    if(created>=weekAgo) weekRevenue+=order.total
    for(const item of order.items){
      const current=productMap.get(item.productId)||{name:item.name,qty:0,revenue:0}
      current.qty+=item.qty
      current.revenue+=item.price*item.qty
      productMap.set(item.productId,current)
    }
  }
  const days=[...dayMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14).map(([date,total])=>({date,total}))
  const weeks=[...weekMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-8).map(([week,total])=>({week,total}))
  const topProducts=[...productMap.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,8)
  const openOrders=orders.filter(o=>o.status!=='Completed'&&o.status!=='Cancelled').length
  return {byStatus,days,weeks,topProducts,weekRevenue,openOrders,orderCount:orders.length}
}

function isoWeekKey(date:Date){
  const tmp=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()))
  const day=tmp.getUTCDay()||7
  tmp.setUTCDate(tmp.getUTCDate()+4-day)
  const yearStart=new Date(Date.UTC(tmp.getUTCFullYear(),0,1))
  const week=Math.ceil((((tmp.getTime()-yearStart.getTime())/86400000)+1)/7)
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2,'0')}`
}

/** Checks and deducts sellable-product stock, plus any legacy per-piece fabric amounts still stored on the line. Customer-chosen fabrics have no usage amount, so they are not deducted. */
function reserve(data:DataFile,items:OrderItem[],errorMessage?:string){
  for(const [id,qty] of productUsage(items)){
    const product=data.shopProducts.find(p=>p.id===id)
    if(!product) throw new StoreError(errorMessage||'Product is not available',errorMessage?409:400)
    if(product.stock<qty) throw new StoreError(errorMessage||`Insufficient stock for ${product.name}`,409)
  }
  for(const [id,qty] of inventoryUsage(items)){
    const item=data.products.find(p=>p.id===id)
    if(!item) throw new StoreError(errorMessage||'A fabric for this product is no longer in inventory',409)
    if(item.stock+1e-9<qty) throw new StoreError(errorMessage||`Insufficient stock for ${item.name}`,409)
  }
  for(const [id,qty] of productUsage(items)){
    const product=data.shopProducts.find(p=>p.id===id)!
    product.stock-=qty
  }
  for(const [id,qty] of inventoryUsage(items)){
    const item=data.products.find(p=>p.id===id)!
    item.stock=round2(item.stock-qty)
  }
}

export function orderLines(merged:ReturnType<typeof mergeQty>,find:{shop:(id:string)=>ShopProduct|null|undefined;inventory:(id:string)=>Product|null|undefined},options:{requireFabric?:boolean}={}){
  const lines:OrderItem[]=[]
  for(const item of merged){
    if(item.kind==='product'){
      const product=find.shop(item.productId)
      if(!product||product.status!=='active') throw new StoreError('Product is not available',400)
      if(product.stock<item.qty) throw new StoreError(`Insufficient stock for ${product.name}`,409)
      const choice=garmentChoice(product,item.size,item.style,item.color)
      const chosenFabric=resolveChosenFabric(item.fabricId?find.inventory(item.fabricId):undefined,Boolean(options.requireFabric||item.fabricId))
      lines.push({productId:product.id,name:product.name,price:product.price,qty:item.qty,kind:'product',...choice,...(chosenFabric?{chosenFabric}:{}),progress:'Queued'})
    }else{
      const product=find.inventory(item.productId)
      if(!product||!product.active) throw new StoreError('Product is not available',400)
      if(product.stock<item.qty) throw new StoreError(`Insufficient stock for ${product.name}`,409)
      lines.push({productId:product.id,name:product.name,price:product.price??0,qty:item.qty,kind:'inventory'})
    }
  }
  return lines
}

function applyOrder(data:DataFile,input:PlaceOrderInput){
  const lines=orderLines(mergeQty(input.items),{
    shop:id=>data.shopProducts.find(p=>p.id===id),
    inventory:id=>data.products.find(p=>p.id===id),
  },{requireFabric:input.source!=='admin'})
  reserve(data,lines)
  const now=new Date().toISOString()
  const total=lines.reduce((sum,line)=>sum+line.price*line.qty,0)
  const order:ShopOrder={
    id:randomUUID(),
    customerUid:input.customerUid,
    customerEmail:input.customerEmail,
    customerName:input.customerName||'',
    items:lines,
    total,
    status:input.source==='admin'?'Paid':'Pending',
    note:input.note||'',
    source:input.source,
    createdAt:now,
    updatedAt:now,
  }
  data.orders.push(order)
  return order
}

function restoreStock(data:DataFile,order:ShopOrder){
  for(const [id,qty] of productUsage(order.items)){
    const product=data.shopProducts.find(p=>p.id===id)
    if(product) product.stock+=qty
  }
  for(const [id,qty] of inventoryUsage(order.items)){
    const item=data.products.find(p=>p.id===id)
    if(item) item.stock=round2(item.stock+qty)
  }
}

export function createMemoryStore(seed?:Partial<DataFile>):ShopStore{
  const data:DataFile={products:[...(seed?.products||[])],shopProducts:[...(seed?.shopProducts||[])],orders:[...(seed?.orders||[])],notifications:[...(seed?.notifications||[])],profiles:[...(seed?.profiles||[])]}
  return implementation(()=>Promise.resolve(data), async next=>{ Object.assign(data,next) })
}

function implementation(load:()=>Promise<DataFile>, persist:(data:DataFile)=>Promise<void>):ShopStore{
  let queue:Promise<unknown>=Promise.resolve()
  const locked=<T>(fn:()=>Promise<T>)=>{
    const run=queue.then(fn,fn)
    queue=run.then(()=>undefined,()=>undefined)
    return run
  }
  return {
    listProducts(){return locked(async()=>(await load()).products.map(p=>({...p})))},
    getProduct(id){return locked(async()=>{
      const product=(await load()).products.find(p=>p.id===id)
      return product?{...product}:null
    })},
    createProduct(input){return locked(async()=>{
      const data=await load()
      const now=new Date().toISOString()
      const product:Product={...input,id:randomUUID(),createdAt:now,updatedAt:now}
      data.products.push(product)
      await persist(data)
      return {...product}
    })},
    updateProduct(id,input){return locked(async()=>{
      const data=await load()
      const product=data.products.find(p=>p.id===id)
      if(!product) return null
      Object.assign(product,input,{updatedAt:new Date().toISOString()})
      await persist(data)
      return {...product}
    })},
    deleteProduct(id){return locked(async()=>{
      const data=await load()
      const index=data.products.findIndex(p=>p.id===id)
      if(index<0) return false
      data.products.splice(index,1)
      await persist(data)
      return true
    })},
    listShopProducts(){return locked(async()=>(await load()).shopProducts.map(cloneProduct))},
    getShopProduct(id){return locked(async()=>{
      const product=(await load()).shopProducts.find(p=>p.id===id)
      return product?cloneProduct(product):null
    })},
    createShopProduct(input){return locked(async()=>{
      const data=await load()
      const now=new Date().toISOString()
      const product:ShopProduct=withGarmentDefaults({...input,fabrics:(input.fabrics||[]).map(f=>({...f})),colors:(input.colors||[]).map(c=>({...c})),id:randomUUID(),createdAt:now,updatedAt:now})
      data.shopProducts.push(product)
      await persist(data)
      return cloneProduct(product)
    })},
    updateShopProduct(id,input){return locked(async()=>{
      const data=await load()
      const product=data.shopProducts.find(p=>p.id===id)
      if(!product) return null
      Object.assign(product,input,{updatedAt:new Date().toISOString()})
      if(input.fabrics) product.fabrics=input.fabrics.map(f=>({...f}))
      if(input.colors) product.colors=input.colors.map(c=>({...c}))
      await persist(data)
      return cloneProduct(product)
    })},
    deleteShopProduct(id){return locked(async()=>{
      const data=await load()
      const index=data.shopProducts.findIndex(p=>p.id===id)
      if(index<0) return false
      data.shopProducts.splice(index,1)
      await persist(data)
      return true
    })},
    listOrders(filter){return locked(async()=>{
      let orders=(await load()).orders.map(cloneOrder)
      if(filter?.customerUid && filter?.customerEmail){
        orders=orders.filter(o=>o.customerUid===filter.customerUid||o.customerEmail.toLowerCase()===filter.customerEmail!.toLowerCase())
      }else if(filter?.customerUid){
        orders=orders.filter(o=>o.customerUid===filter.customerUid)
      }
      return orders.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))
    })},
    getOrder(id){return locked(async()=>{
      const order=(await load()).orders.find(o=>o.id===id)
      return order?cloneOrder(order):null
    })},
    placeOrder(input){return locked(async()=>{
      const data=await load()
      const order=applyOrder(data,input)
      await persist(data)
      return cloneOrder(order)
    })},
    updateOrder(id,patch){return locked(async()=>{
      const data=await load()
      const order=data.orders.find(o=>o.id===id)
      if(!order) return null
      const previous=order.status
      if(patch.note!==undefined) order.note=patch.note
      if(patch.status!==undefined && patch.status!==previous){
        if(patch.status==='Cancelled' && previous!=='Cancelled') restoreStock(data,order)
        if(previous==='Cancelled' && patch.status!=='Cancelled'){
          // re-reserve product stock and fabrics
          reserve(data,order.items,`Insufficient stock to reopen ${order.id}`)
        }
        order.status=patch.status
      }
      order.updatedAt=new Date().toISOString()
      await persist(data)
      return cloneOrder(order)
    })},
    updateOrderLineProgress(id,lineIndex,stage){return locked(async()=>{
      const data=await load()
      const order=data.orders.find(o=>o.id===id)
      if(!order) return null
      moveLineProgress(order,lineIndex,stage)
      order.updatedAt=new Date().toISOString()
      await persist(data)
      return cloneOrder(order)
    })},
    listNotifications(recipient,limit=20){return locked(async()=>{
      const cap=Math.max(1,Math.min(limit||20,50))
      return (await load()).notifications
        .filter(n=>n.recipient===recipient)
        .sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))
        .slice(0,cap)
        .map(n=>({...n}))
    })},
    unreadCount(recipient){return locked(async()=>(
      (await load()).notifications.filter(n=>n.recipient===recipient&&!n.read).length
    ))},
    createNotification(input){return locked(async()=>{
      const data=await load()
      const notification:ShopNotification={
        id:randomUUID(),
        recipient:input.recipient,
        customerEmail:input.customerEmail||'',
        type:input.type,
        title:input.title,
        message:input.message,
        link:input.link,
        read:false,
        createdAt:new Date().toISOString(),
      }
      data.notifications.push(notification)
      await persist(data)
      return {...notification}
    })},
    markNotificationsRead(recipient,ids){return locked(async()=>{
      const data=await load()
      const select=ids==='all'?null:new Set(ids)
      let count=0
      for(const notification of data.notifications){
        if(notification.recipient!==recipient||notification.read) continue
        if(select&&!select.has(notification.id)) continue
        notification.read=true
        count++
      }
      if(count) await persist(data)
      return count
    })},
    getProfile(id){return locked(async()=>{
      const found=(await load()).profiles.find(p=>p.id===id)
      return found?{...found}:emptyProfile(id)
    })},
    saveProfile(id,patch){return locked(async()=>{
      const data=await load()
      let profile=data.profiles.find(p=>p.id===id)
      if(!profile){ profile=emptyProfile(id); data.profiles.push(profile) }
      Object.assign(profile,patch,{id,updatedAt:new Date().toISOString()})
      await persist(data)
      return {...profile}
    })},
  }
}

export const sampleProducts=():Product[]=>{
  const now=new Date().toISOString()
  const rows:[string,number,string][]=[
    ['Piña Barong fabric',18,'yd'],
    ['Cotton twill, navy',42,'yd'],
    ['Custom-cut patch',64,'pcs'],
    ['Laser-cut lace panel',9,'pcs'],
    ['Formal lining, silk-blend',27,'yd'],
    ['Wedding barong kit',7,'kits'],
  ]
  return rows.map(([name,stock,unit],i)=>({
    id:`sample-${i+1}`,name,stock,unit,active:true,createdAt:now,updatedAt:now,
  }))
}

export function createJsonStore(file=path.join(process.cwd(),'data','store.json')):ShopStore{
  let cache:DataFile|undefined
  async function load(){
    if(cache) return cache
    try{
      const raw=await readFile(/* turbopackIgnore: true */ file,'utf8')
      const parsed=JSON.parse(raw) as DataFile
      cache={products:parsed.products||[],shopProducts:parsed.shopProducts||[],orders:parsed.orders||[],notifications:parsed.notifications||[],profiles:parsed.profiles||[]}
    }catch(error){
      const code=(error as NodeJS.ErrnoException).code
      if(code!=='ENOENT') throw error
      cache={products:sampleProducts(),shopProducts:[],orders:[],notifications:[],profiles:[]}
      await persist(cache)
    }
    return cache
  }
  async function persist(data:DataFile){
    cache=data
    await mkdir(/* turbopackIgnore: true */ path.dirname(file),{recursive:true})
    const temp=`${file}.${process.pid}.tmp`
    await writeFile(/* turbopackIgnore: true */ temp,JSON.stringify({products:data.products,shopProducts:data.shopProducts||[],orders:data.orders,notifications:data.notifications||[],profiles:data.profiles||[]},null,2),'utf8')
    await rename(/* turbopackIgnore: true */ temp, /* turbopackIgnore: true */ file)
  }
  return implementation(load,persist)
}

export type StoreKind = 'firestore' | 'json'
let defaultStore:ShopStore|undefined
let defaultKind:StoreKind='json'

export function storePreference():'json'|'firestore'|'auto'{
  const value=(process.env.SHOP_STORE||process.env.DATA_STORE||'auto').toLowerCase()
  if(value==='json'||value==='file'||value==='local') return 'json'
  if(value==='firestore'||value==='firebase') return 'firestore'
  return 'auto'
}

export function activeStoreKind(){return defaultKind}

function isUnavailable(error:unknown){
  const message=error instanceof Error?error.message:String(error)
  return /FIREBASE_ADMIN_CREDENTIALS_MISSING|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|UNAVAILABLE|PERMISSION_DENIED|401|403|404|Could not load the default credentials/i.test(message)
}

export function createResilientStore():ShopStore{
  let inner:ShopStore|undefined
  let pending:Promise<ShopStore>|undefined

  async function resolve(){
    if(inner) return inner
    if(!pending){
      pending=(async()=>{
        const mode=storePreference()
        if(mode!=='json'){
          const {hasAdminCredentials,missingAdminCredentialsMessage}=await import('./firebaseAdmin')
          if(!hasAdminCredentials()){
            if(mode==='firestore') throw new Error(missingAdminCredentialsMessage)
            console.warn('FABRICUT: Firebase Admin credentials are missing; using local JSON store at data/store.json')
          }else{
            try{
              const {createFirestoreStore}=await import('./firestoreStore')
              const firestore=createFirestoreStore()
              await firestore.listProducts()
              defaultKind='firestore'
              inner=firestore
              return inner
            }catch(error){
              if(mode==='firestore' || !isUnavailable(error)) throw error
              console.warn('FABRICUT: Firestore is unreachable; using local JSON store at data/store.json')
            }
          }
        }
        defaultKind='json'
        inner=createJsonStore()
        return inner
      })().finally(()=>{pending=undefined})
    }
    return pending
  }

  return {
    listProducts:()=>resolve().then(s=>s.listProducts()),
    getProduct:(id)=>resolve().then(s=>s.getProduct(id)),
    createProduct:(data)=>resolve().then(s=>s.createProduct(data)),
    updateProduct:(id,data)=>resolve().then(s=>s.updateProduct(id,data)),
    deleteProduct:(id)=>resolve().then(s=>s.deleteProduct(id)),
    listShopProducts:()=>resolve().then(s=>s.listShopProducts()),
    getShopProduct:(id)=>resolve().then(s=>s.getShopProduct(id)),
    createShopProduct:(data)=>resolve().then(s=>s.createShopProduct(data)),
    updateShopProduct:(id,data)=>resolve().then(s=>s.updateShopProduct(id,data)),
    deleteShopProduct:(id)=>resolve().then(s=>s.deleteShopProduct(id)),
    listOrders:(filter)=>resolve().then(s=>s.listOrders(filter)),
    getOrder:(id)=>resolve().then(s=>s.getOrder(id)),
    placeOrder:(input)=>resolve().then(s=>s.placeOrder(input)),
    updateOrder:(id,data)=>resolve().then(s=>s.updateOrder(id,data)),
    updateOrderLineProgress:(id,index,stage)=>resolve().then(s=>s.updateOrderLineProgress(id,index,stage)),
    listNotifications:(recipient,limit)=>resolve().then(s=>s.listNotifications(recipient,limit)),
    unreadCount:(recipient)=>resolve().then(s=>s.unreadCount(recipient)),
    createNotification:(input)=>resolve().then(s=>s.createNotification(input)),
    markNotificationsRead:(recipient,ids)=>resolve().then(s=>s.markNotificationsRead(recipient,ids)),
    getProfile:(id)=>resolve().then(s=>s.getProfile(id)),
    saveProfile:(id,patch)=>resolve().then(s=>s.saveProfile(id,patch)),
  }
}

export function shopStore(){
  if(!defaultStore) defaultStore=createResilientStore()
  return defaultStore
}

export {countsTowardRevenue,LOW_STOCK_THRESHOLD}
