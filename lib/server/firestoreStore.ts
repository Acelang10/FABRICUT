import {randomUUID} from 'node:crypto'
import type {DocumentData,Firestore} from 'firebase-admin/firestore'
import type {DocumentReference,DocumentSnapshot,Transaction} from 'firebase-admin/firestore'
import type {FabricUse,OrderItem,OrderStatus,Product,ShopNotification,ShopOrder,ShopProduct,UserProfile} from '../types'
import {StoreError,emptyProfile,mergeQty,moveLineProgress,orderLines,type NotificationInput,type PlaceOrderInput,type ProductInput,type ShopProductInput,type ShopStore} from './store'
import {inventoryUsage,productUsage,round2} from '../fabrics'
import {PRODUCTION_STAGES,withGarmentDefaults,type ProductionStage} from '../clothing'
import {adminFirestore} from './firebaseAdmin'

function productFrom(id:string,data:DocumentData):Product{
  const product:Product={
    id,
    name:String(data.name||''),
    stock:Number(data.stock)||0,
    unit:String(data.unit||'yd'),
    imageUrl:String(data.imageUrl||''),
    active:data.active!==false,
    createdAt:String(data.createdAt||''),
    updatedAt:String(data.updatedAt||''),
  }
  // Keep leftover fields from older docs so a later hide/show or edit does not wipe them.
  if(data.category) product.category=data.category
  if(data.price!=null&&data.price!==''){
    const price=Number(data.price)
    if(Number.isFinite(price)) product.price=price
  }
  if(data.description!=null&&data.description!=='') product.description=String(data.description)
  if(data.imageColor) product.imageColor=String(data.imageColor)
  return product
}

function fabricsFrom(value:unknown):FabricUse[]{
  if(!Array.isArray(value)) return []
  return value.map((f:Partial<FabricUse>)=>({
    inventoryItemId:String(f.inventoryItemId||''),
    name:String(f.name||''),
    unit:String(f.unit||''),
    quantity:Number(f.quantity||0),
  })).filter(f=>f.inventoryItemId&&f.quantity>0)
}

function stringList(value:unknown){return Array.isArray(value)?value.map(String):[]}

function shopProductFrom(id:string,data:DocumentData):ShopProduct{
  return withGarmentDefaults({
    clothingType:String(data.clothingType||''),
    patternStyles:stringList(data.patternStyles),
    sizes:stringList(data.sizes),
    id,
    name:String(data.name||''),
    description:String(data.description||''),
    price:Number(data.price||0),
    imageUrl:String(data.imageUrl||''),
    status:data.status==='active'?'active':'draft',
    stock:Number(data.stock||0),
    fabrics:fabricsFrom(data.fabrics),
    createdAt:String(data.createdAt||''),
    updatedAt:String(data.updatedAt||''),
  })
}

function shopProductFields(input:ShopProductInput|ShopProduct){
  const {name,description,price,imageUrl,status,stock,fabrics,clothingType,patternStyles,sizes}=withGarmentDefaults(input)
  return {name,description,price,imageUrl,status,stock,clothingType,patternStyles:[...patternStyles],sizes:[...sizes],fabrics:fabrics.map(f=>({inventoryItemId:f.inventoryItemId,name:f.name,unit:f.unit,quantity:f.quantity}))}
}

function lineFrom(item:OrderItem):OrderItem{
  const line:OrderItem={
    productId:String(item.productId),
    name:String(item.name),
    price:Number(item.price),
    qty:Number(item.qty),
  }
  if(item.kind==='product'){
    line.kind='product';line.fabrics=fabricsFrom(item.fabrics)
    if(item.clothingType) line.clothingType=String(item.clothingType)
    if(item.style) line.style=String(item.style)
    if(item.size) line.size=String(item.size)
  }
  else if(item.kind==='inventory') line.kind='inventory'
  if(item.progress&&(PRODUCTION_STAGES as readonly string[]).includes(item.progress)) line.progress=item.progress as ProductionStage
  if(item.progressUpdatedAt) line.progressUpdatedAt=String(item.progressUpdatedAt)
  return line
}

function orderFrom(id:string,data:DocumentData):ShopOrder{
  const items=Array.isArray(data.items)?data.items.map((item:OrderItem)=>lineFrom(item)):[]
  return {
    id,
    customerUid:String(data.customerUid||''),
    customerEmail:String(data.customerEmail||''),
    customerName:String(data.customerName||''),
    items,
    total:Number(data.total||0),
    status:data.status as OrderStatus,
    note:String(data.note||''),
    source:data.source==='admin'?'admin':'customer',
    createdAt:String(data.createdAt||''),
    updatedAt:String(data.updatedAt||''),
  }
}

function productFields(input:ProductInput|Product){
  // Only the current fabric fields are written. Legacy keys are left untouched on existing docs.
  return {name:input.name,stock:input.stock,unit:input.unit,imageUrl:input.imageUrl||'',active:input.active}
}

/** Firestore-safe copy of order lines (no undefined fields). */
function linePayload(items:OrderItem[]){
  return items.map(item=>{
    const line:Record<string,unknown>={productId:item.productId,name:item.name,price:item.price,qty:item.qty}
    if(item.kind) line.kind=item.kind
    if(item.kind==='product') line.fabrics=(item.fabrics||[]).map(f=>({inventoryItemId:f.inventoryItemId,name:f.name,unit:f.unit,quantity:f.quantity}))
    for(const key of ['clothingType','style','size','progress','progressUpdatedAt'] as const){ if(item[key]) line[key]=item[key] }
    return line
  })
}

function profileFrom(id:string,data:DocumentData|undefined):UserProfile{
  if(!data) return emptyProfile(id)
  return {
    id,
    displayName:String(data.displayName||''),
    phone:String(data.phone||''),
    address:String(data.address||''),
    birthday:String(data.birthday||''),
    photoUrl:String(data.photoUrl||''),
    updatedAt:String(data.updatedAt||''),
  }
}

function notificationFrom(id:string,data:DocumentData):ShopNotification{
  return {
    id,
    recipient:String(data.recipient||''),
    customerEmail:String(data.customerEmail||''),
    type:data.type,
    title:String(data.title||''),
    message:String(data.message||''),
    link:String(data.link||''),
    read:data.read===true,
    createdAt:String(data.createdAt||''),
  }
}

export function createFirestoreStore(db:Firestore=adminFirestore()):ShopStore{
  // 'products' keeps the existing admin inventory (raw fabrics) so live data is untouched;
  // sellable products live in 'shopProducts'.
  const products=db.collection('products')
  const shopProducts=db.collection('shopProducts')
  const orders=db.collection('orders')

  /**
   * Reads every product/inventory doc an order touches (all reads before writes, as Firestore requires),
   * then checks and applies stock changes. sign=-1 reserves, sign=+1 restores.
   */
  async function adjustStock(tx:Transaction,items:OrderItem[],sign:1|-1,errorMessage?:string){
    const productNeeds=productUsage(items)
    const inventoryNeeds=inventoryUsage(items)
    const productRefs=[...productNeeds.keys()].map(id=>shopProducts.doc(id))
    const inventoryRefs=[...inventoryNeeds.keys()].map(id=>products.doc(id))
    const all:DocumentReference[]=[...productRefs,...inventoryRefs]
    const snaps:DocumentSnapshot[]=all.length?await tx.getAll(...all):[]
    const now=new Date().toISOString()
    const writes:[DocumentReference,number][]=[]
    productRefs.forEach((ref,index)=>{
      const snap=snaps[index]
      const qty=productNeeds.get(ref.id)!
      if(!snap?.exists){ if(sign<0) throw new StoreError(errorMessage||'Product is not available',errorMessage?409:400); return }
      const stock=Number(snap.data()?.stock||0)
      if(sign<0&&stock<qty) throw new StoreError(errorMessage||`Insufficient stock for ${String(snap.data()?.name||'product')}`,409)
      writes.push([ref,stock+sign*qty])
    })
    inventoryRefs.forEach((ref,index)=>{
      const snap=snaps[productRefs.length+index]
      const qty=inventoryNeeds.get(ref.id)!
      if(!snap?.exists){ if(sign<0) throw new StoreError(errorMessage||'A fabric for this product is no longer in inventory',409); return }
      const stock=Number(snap.data()?.stock||0)
      if(sign<0&&stock+1e-9<qty) throw new StoreError(errorMessage||`Insufficient stock for ${String(snap.data()?.name||'item')}`,409)
      writes.push([ref,round2(stock+sign*qty)])
    })
    for(const [ref,stock] of writes) tx.update(ref,{stock,updatedAt:now})
  }
  const notifications=db.collection('notifications')
  const profiles=db.collection('profiles')

  return {
    async listProducts(){
      const snap=await products.get()
      return snap.docs.map(doc=>productFrom(doc.id,doc.data())).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''))
    },
    async getProduct(id){
      const doc=await products.doc(id).get()
      return doc.exists?productFrom(doc.id,doc.data()!):null
    },
    async createProduct(input){
      const now=new Date().toISOString()
      const ref=products.doc()
      const product:Product={...input,id:ref.id,createdAt:now,updatedAt:now}
      await ref.set({...productFields(product),createdAt:now,updatedAt:now})
      return product
    },
    async updateProduct(id,input){
      const ref=products.doc(id)
      const existing=await ref.get()
      if(!existing.exists) return null
      const updatedAt=new Date().toISOString()
      await ref.update({...input,updatedAt})
      const data={...existing.data(),...input,updatedAt}
      return productFrom(id,data)
    },
    async deleteProduct(id){
      const ref=products.doc(id)
      const existing=await ref.get()
      if(!existing.exists) return false
      await ref.delete()
      return true
    },
    async listShopProducts(){
      const snap=await shopProducts.get()
      return snap.docs.map(doc=>shopProductFrom(doc.id,doc.data())).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''))
    },
    async getShopProduct(id){
      const doc=await shopProducts.doc(id).get()
      return doc.exists?shopProductFrom(doc.id,doc.data()!):null
    },
    async createShopProduct(input){
      const now=new Date().toISOString()
      const ref=shopProducts.doc()
      const fields=shopProductFields(input)
      await ref.set({...fields,createdAt:now,updatedAt:now})
      return {...fields,id:ref.id,createdAt:now,updatedAt:now}
    },
    async updateShopProduct(id,input){
      const ref=shopProducts.doc(id)
      const existing=await ref.get()
      if(!existing.exists) return null
      const updatedAt=new Date().toISOString()
      const merged=shopProductFrom(id,{...existing.data(),...input,updatedAt})
      await ref.update({...shopProductFields(merged),updatedAt})
      return merged
    },
    async deleteShopProduct(id){
      const ref=shopProducts.doc(id)
      const existing=await ref.get()
      if(!existing.exists) return false
      await ref.delete()
      return true
    },
    async listOrders(filter){
      let snap
      if(filter?.customerUid && filter.customerEmail){
        const [byUid,byEmail]=await Promise.all([
          orders.where('customerUid','==',filter.customerUid).get(),
          orders.where('customerEmail','==',filter.customerEmail).get(),
        ])
        const map=new Map<string,ShopOrder>()
        for(const doc of [...byUid.docs,...byEmail.docs]) map.set(doc.id,orderFrom(doc.id,doc.data()))
        return [...map.values()].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))
      }
      if(filter?.customerUid){
        snap=await orders.where('customerUid','==',filter.customerUid).get()
      }else{
        snap=await orders.get()
      }
      return snap.docs.map(doc=>orderFrom(doc.id,doc.data())).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))
    },
    async getOrder(id){
      const doc=await orders.doc(id).get()
      return doc.exists?orderFrom(doc.id,doc.data()!):null
    },
    async placeOrder(input:PlaceOrderInput){
      return db.runTransaction(async tx=>{
        const merged=mergeQty(input.items)
        const shopIds=[...new Set(merged.filter(i=>i.kind==='product').map(i=>i.productId))]
        const inventoryIds=[...new Set(merged.filter(i=>i.kind==='inventory').map(i=>i.productId))]
        const refs=[...shopIds.map(id=>shopProducts.doc(id)),...inventoryIds.map(id=>products.doc(id))]
        const snaps=refs.length?await tx.getAll(...refs):[]
        const shopMap=new Map<string,ShopProduct>()
        const inventoryMap=new Map<string,Product>()
        snaps.forEach((snap,index)=>{
          if(!snap.exists) return
          if(index<shopIds.length) shopMap.set(snap.id,shopProductFrom(snap.id,snap.data()!))
          else inventoryMap.set(snap.id,productFrom(snap.id,snap.data()!))
        })
        const lines=orderLines(merged,{shop:id=>shopMap.get(id),inventory:id=>inventoryMap.get(id)})
        await adjustStock(tx,lines,-1)
        const now=new Date().toISOString()
        const total=lines.reduce((sum,line)=>sum+line.price*line.qty,0)
        const id=randomUUID()
        const order:ShopOrder={
          id,
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
        const {id:_id,items:_items,...payload}=order
        tx.set(orders.doc(id),{...payload,items:linePayload(lines)})
        return order
      })
    },
    async updateOrder(id,patch){
      return db.runTransaction(async tx=>{
        const ref=orders.doc(id)
        const snap=await tx.get(ref)
        if(!snap.exists) return null
        const order=orderFrom(id,snap.data()!)
        const previous=order.status
        const updates:Record<string,unknown>={updatedAt:new Date().toISOString()}
        if(patch.note!==undefined){updates.note=patch.note;order.note=patch.note}
        if(patch.status!==undefined && patch.status!==previous){
          if(patch.status==='Cancelled' && previous!=='Cancelled') await adjustStock(tx,order.items,1)
          if(previous==='Cancelled' && patch.status!=='Cancelled') await adjustStock(tx,order.items,-1,`Insufficient stock to reopen ${order.id}`)
          updates.status=patch.status
          order.status=patch.status
        }
        order.updatedAt=String(updates.updatedAt)
        tx.update(ref,updates)
        return order
      })
    },
    async updateOrderLineProgress(id,lineIndex,stage){
      return db.runTransaction(async tx=>{
        const ref=orders.doc(id)
        const snap=await tx.get(ref)
        if(!snap.exists) return null
        const order=orderFrom(id,snap.data()!)
        moveLineProgress(order,lineIndex,stage)
        order.updatedAt=new Date().toISOString()
        tx.update(ref,{items:linePayload(order.items),updatedAt:order.updatedAt})
        return order
      })
    },
    async listNotifications(recipient,limit=20){
      const cap=Math.max(1,Math.min(limit||20,50))
      const snap=await notifications.where('recipient','==',recipient).get()
      return snap.docs
        .map(doc=>notificationFrom(doc.id,doc.data()))
        .sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))
        .slice(0,cap)
    },
    async unreadCount(recipient){
      const snap=await notifications.where('recipient','==',recipient).get()
      return snap.docs.filter(doc=>doc.data()?.read!==true).length
    },
    async createNotification(input:NotificationInput){
      const now=new Date().toISOString()
      const ref=notifications.doc()
      const notification:ShopNotification={
        id:ref.id,
        recipient:input.recipient,
        customerEmail:input.customerEmail||'',
        type:input.type,
        title:input.title,
        message:input.message,
        link:input.link,
        read:false,
        createdAt:now,
      }
      const {id:_id,...payload}=notification
      await ref.set(payload)
      return notification
    },
    async markNotificationsRead(recipient,ids){
      const snap=await notifications.where('recipient','==',recipient).get()
      const select=ids==='all'?null:new Set(ids)
      const pending=snap.docs.filter(doc=>{
        if(doc.data()?.read===true) return false
        if(select&&!select.has(doc.id)) return false
        return true
      })
      for(let i=0;i<pending.length;i+=400){
        const batch=db.batch()
        for(const doc of pending.slice(i,i+400)) batch.update(doc.ref,{read:true})
        await batch.commit()
      }
      return pending.length
    },
    async getProfile(id){
      const snap=await profiles.doc(id).get()
      return profileFrom(id,snap.exists?snap.data():undefined)
    },
    async saveProfile(id,patch){
      const ref=profiles.doc(id)
      const updatedAt=new Date().toISOString()
      const clean:Record<string,string>={}
      for(const [key,value] of Object.entries(patch)) if(typeof value==='string') clean[key]=value
      await ref.set({...clean,updatedAt},{merge:true})
      const snap=await ref.get()
      return profileFrom(id,snap.data())
    },
  }
}
