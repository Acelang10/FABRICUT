import path from 'node:path'
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto'
import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises'
import {ZodError} from 'zod'
import {firebaseConfig} from './config'
import {bearer,verifiedIdentity,verifyToken,type Identity} from './identity'
import {lineProgressSchema,markNotificationsReadSchema,placeOrderSchema,productInputSchema,productUpdateSchema,profileUpdateSchema,shopProductInputSchema,shopProductUpdateSchema,updateOrderSchema,uploadConfirmSchema,uploadSignSchema} from './shop-schema'
import {StoreError,buildReports,shopStore,type ShopStore} from './store'
import {announceLineProgress,announceAdminOrderUpdate,announceLowStock,announceOrderCancelledByCustomer,announceOrderPlaced,lowStockThreshold} from './notifications'
import type {AppUser,FabricUse} from '../types'
import {round2} from '../fabrics'
import {garmentError,withGarmentDefaults} from '../clothing'
import {esp32Request,localControllerEnabled,type FetchLike} from './localController'
import {cloudinaryClient,cloudinaryCredentials,deliveryUrl,signUpload,uploadProblem,type CloudinaryClient,type CloudinaryCredentials} from './cloudinary'
import {ADMIN_UPLOAD_KINDS,MAX_UPLOAD_BYTES,type UploadKind} from '../media'
import {clearCookieHeader,cookieHeader,readCookie,signSession,verifySession,type Session} from '../auth/session'

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}

function json(data:unknown,status=200,extra?:HeadersInit){
  return Response.json(data,{status,headers:{...headers,...extra}})
}

export interface Dependencies {
  verify?:typeof verifyToken
  project?:()=>string
  uploadsDirectory?:string
  store?:ShopStore
  adminUsername?:()=>string
  adminPassword?:()=>string
  sessionSecret?:()=>string
  /** Overrides the local-only check (tests). */
  localController?:(req:Request)=>boolean
  esp32Fetch?:FetchLike
  esp32BaseUrl?:string
  /** Cloudinary credentials (tests); default reads CLOUDINARY_URL / CLOUDINARY_* env. */
  cloudinary?:()=>CloudinaryCredentials|null
  cloudinaryClient?:CloudinaryClient
}

/** Profile doc id: the env admin is 'admin'; customers use their Firebase uid. */
export function profileKey(user:AppUser){
  if(user.role==='admin') return 'admin'
  return user.uid==='admin'?'customer_admin':user.uid
}

async function parseBody(req:Request){
  if(Number(req.headers.get('content-length')||0)>262144) throw new Error('BODY_TOO_LARGE')
  const text=await req.text()
  if(Buffer.byteLength(text)>262144) throw new Error('BODY_TOO_LARGE')
  return JSON.parse(text) as unknown
}

const uploads=()=>path.join(process.cwd(),'server/uploads')

async function asset(filename:string,directory=uploads()){
  if(!/^[a-zA-Z0-9_.-]+$/.test(filename)||filename==='.'||filename==='..') return json({error:'Invalid file'},400)
  try{
    const root=await realpath(/* turbopackIgnore: true */ directory)
    const file=await realpath(/* turbopackIgnore: true */ path.join(root,filename))
    if(path.dirname(file)!==root) return json({error:'Access denied'},403)
    const ext=path.extname(file).toLowerCase()
    const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}
    if(!mime[ext]) return json({error:'Unsupported file'},415)
    const data=await readFile(file)
    return new Response(new Uint8Array(data),{headers:{...headers,'Content-Type':mime[ext],'Content-Disposition':`inline; filename="${filename}"`}})
  }catch{
    return json({error:'File not found'},404)
  }
}

async function upload(req:Request,directory=uploads()){
  const limit=10*1024*1024
  if(Number(req.headers.get('content-length')||0)>limit+65536) return json({error:'File too large'},413)
  const reader=req.body?.getReader()
  if(!reader) return json({error:'Pattern required'},400)
  const chunks:Uint8Array[]=[]
  let size=0
  while(true){
    const {value,done}=await reader.read()
    if(done) break
    size+=value.byteLength
    if(size>limit+65536){await reader.cancel();return json({error:'File too large'},413)}
    chunks.push(value)
  }
  const data=await new Request(req.url,{method:'POST',headers:req.headers,body:Buffer.concat(chunks)}).formData()
  const file=data.get('pattern')
  if(!(file instanceof File)||!file.size) return json({error:'Pattern required'},400)
  if(file.size>limit) return json({error:'File too large'},413)
  const bytes=Buffer.from(await file.arrayBuffer())
  let extension=''
  if(file.type==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) extension='.png'
  if(file.type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255) extension='.jpg'
  if(file.type==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP') extension='.webp'
  if(!extension) return json({error:'Only valid PNG, JPEG or WebP images are allowed'},415)
  await mkdir(directory,{recursive:true})
  const filename=`${randomUUID()}${extension}`
  await writeFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ directory,filename),bytes,{mode:0o600,flag:'wx'})
  return json({filename,url:`/api/pattern-files/${filename}`,message:'Pattern uploaded'},201)
}

function secretEqual(left:string,right:string,secret:string){
  const key=Buffer.from(secret)
  const a=createHmac('sha256',key).update(left).digest()
  const b=createHmac('sha256',key).update(right).digest()
  return timingSafeEqual(a,b)
}

function adminUser():AppUser{
  return {uid:'admin',email:'admin',role:'admin',name:'admin'}
}

function toUser(session:Session):AppUser{
  return {uid:session.sub,email:session.email,role:session.role,name:session.name}
}

function isSecure(req:Request){
  const url=new URL(req.url)
  if(url.protocol==='https:') return true
  const proto=req.headers.get('x-forwarded-proto')
  return proto==='https'
}

async function sessionResponse(req:Request,session:Session,status=200,secret?:string){
  const token=await signSession(session,secret)
  return json({user:toUser(session)},status,{'Set-Cookie':cookieHeader(token,isSecure(req))})
}

async function readSession(req:Request,deps:Dependencies):Promise<Session|null>{
  const secret=deps.sessionSecret?.()
  const cookie=readCookie(req.headers.get('cookie'))
  if(cookie){
    try{return await verifySession(cookie,secret)}catch{return null}
  }
  return null
}

async function firebaseCustomer(req:Request,deps:Dependencies):Promise<Session|null>{
  const token=bearer(req.headers.get('authorization'))
  if(!token) return null
  const project=(deps.project||(()=>firebaseConfig().projectId))()
  let claims:Identity
  try{claims=await (deps.verify||verifyToken)(token,project)}catch{throw new Error('INVALID_IDENTITY')}
  if(!verifiedIdentity(claims)) throw new Error('UNVERIFIED_IDENTITY')
  return {sub:claims.sub!,email:claims.email||'',role:'customer'}
}

/**
 * Turns {inventoryItemId, quantity} rows into FabricUse snapshots (name + unit from inventory).
 * New selections must be inventory items with stock left; rows already on the product (keepIds) may stay
 * even if that fabric has since run out.
 */
export async function resolveFabrics(store:ShopStore,rows:{inventoryItemId:string;quantity:number}[],keepIds:Set<string>=new Set()):Promise<FabricUse[]>{
  const seen=new Set<string>()
  const result:FabricUse[]=[]
  for(const row of rows){
    if(seen.has(row.inventoryItemId)) throw new StoreError('Each fabric can only be listed once per product',400)
    seen.add(row.inventoryItemId)
    const item=await store.getProduct(row.inventoryItemId)
    if(!item) throw new StoreError('Selected fabric is not in inventory',400)
    if(item.stock<=0&&!keepIds.has(item.id)) throw new StoreError(`${item.name} is out of stock`,400)
    result.push({inventoryItemId:item.id,name:item.name,unit:item.unit,quantity:round2(row.quantity)})
  }
  return result
}

export function createHandler(deps:Dependencies={}){
  const store=()=>deps.store||shopStore()
  const adminUsername=()=>deps.adminUsername?.() ?? process.env.ADMIN_USERNAME ?? 'admin'
  const adminPassword=()=>deps.adminPassword?.() ?? process.env.ADMIN_PASSWORD ?? 'admin123'
  const secretValue=()=>deps.sessionSecret?.() ?? process.env.SESSION_SECRET ?? ''

  return async function handle(req:Request):Promise<Response>{
    const segments=new URL(req.url).pathname.replace(/^\/(api\/)?/,'').split('/').filter(Boolean).map(decodeURIComponent)
    const route=segments.join('/')
    const method=req.method

    if(route==='health'&&method==='GET') return json({status:'ok'})
    // Local Controller API is 404 unless enabled (localhost in dev, or LOCAL_CONTROLLER=on).
    if(segments[0]==='local-controller'){
      const enabled=deps.localController?deps.localController(req):localControllerEnabled(process.env,req.headers.get('host')||new URL(req.url).host)
      if(!enabled) return json({error:'Not found'},404)
    }
    if(route==='auth/config'&&method==='GET'){
      try{return json(firebaseConfig())}catch{return json({error:'Firebase configuration unavailable'},503)}
    }
    if(route==='auth/login') return json({error:'Password login removed; use the Admin tab or customer sign-in'},410)
    if(route==='auth/logout'&&method==='POST'){
      return json({ok:true},200,{'Set-Cookie':clearCookieHeader(isSecure(req))})
    }
    if(route==='auth/admin'&&method==='POST'){
      try{
        const raw=await parseBody(req) as {username?:unknown;password?:unknown}
        const username=typeof raw.username==='string'?raw.username:''
        const password=typeof raw.password==='string'?raw.password:''
        const secret=secretValue()
        if(!secret) return json({error:'Session is not configured'},503)
        const userOk=secretEqual(username,adminUsername(),secret)
        const passOk=secretEqual(password,adminPassword(),secret)
        if(!userOk||!passOk) return json({error:'Incorrect username or password'},401)
        return sessionResponse(req,{sub:'admin',email:adminUsername(),role:'admin',name:'admin'},200,secret)
      }catch(error){
        if(error instanceof SyntaxError) return json({error:'Invalid JSON'},400)
        if(error instanceof Error&&error.message==='BODY_TOO_LARGE') return json({error:'Body too large'},413)
        return json({error:'Sign-in failed'},400)
      }
    }

    try{
      if(route==='auth/session'&&(method==='GET'||method==='POST')){
        try{
          const session=await firebaseCustomer(req,deps)
          if(!session) return json({error:'Firebase sign-in required'},401)
          return sessionResponse(req,session,200,secretValue())
        }catch(error){
          const message=(error as Error).message
          if(message==='INVALID_IDENTITY') return json({error:'Invalid or expired identity'},401)
          if(message==='UNVERIFIED_IDENTITY') return json({error:'Verified Google or email sign-in required'},403)
          return json({error:'Sign-in failed'},401)
        }
      }

      let session=await readSession(req,deps)
      if(!session){
        try{session=await firebaseCustomer(req,deps)}catch(error){
          const message=(error as Error).message
          if(message==='INVALID_IDENTITY') return json({error:'Invalid or expired identity'},401)
          if(message==='UNVERIFIED_IDENTITY') return json({error:'Verified Google or email sign-in required'},403)
        }
      }
      if(!session) return json({error:'Sign-in required'},401)
      const user=toUser(session)

      if((route==='auth/me'||route==='auth/session')&&method==='GET') return json({user})

      // Cloudinary signed uploads: the browser sends the file straight to Cloudinary (no Vercel body limit).
      if(segments[0]==='uploads'&&(route==='uploads/config'||route==='uploads/sign'||route==='uploads/confirm')){
        const creds=(deps.cloudinary||(()=>cloudinaryCredentials()))()
        if(route==='uploads/config'&&method==='GET') return json({configured:Boolean(creds),maxBytes:MAX_UPLOAD_BYTES})
        if(method!=='POST') return json({error:'Method not allowed'},405)
        const raw=await parseBody(req)
        const body:{kind:UploadKind;publicId?:string}=route==='uploads/sign'?uploadSignSchema.parse(raw):uploadConfirmSchema.parse(raw)
        if(ADMIN_UPLOAD_KINDS.includes(body.kind)&&user.role!=='admin') return json({error:'Admin access required'},403)
        if(!creds) return json({error:'Image upload not configured',configured:false},503)
        if(route==='uploads/sign') return json(signUpload(creds,body.kind,user.uid))
        const publicId=body.publicId||''
        const client=deps.cloudinaryClient||cloudinaryClient
        const ownerOk=uploadProblem(body.kind,user.uid,publicId,{public_id:publicId,bytes:0,format:'png',resource_type:'image'})
        if(ownerOk) return json({error:ownerOk.error},ownerOk.status)
        const resource=await client.resource(creds,publicId)
        const problem=uploadProblem(body.kind,user.uid,publicId,resource)
        if(problem){
          if(resource) await client.destroy(creds,publicId)
          return json({error:problem.error},problem.status)
        }
        return json({url:deliveryUrl(creds.cloudName,body.kind,publicId,resource!.version),publicId,bytes:resource!.bytes})
      }

      // Own profile only: there is no route that takes another user's id.
      if(route==='profile'){
        const key=profileKey(user)
        if(method==='GET') return json(await store().getProfile(key))
        if(method==='PUT'||method==='PATCH'){
          const patch=profileUpdateSchema.parse(await parseBody(req))
          return json(await store().saveProfile(key,patch))
        }
        return json({error:'Method not allowed'},405)
      }

      if((segments[0]==='pattern-files'||segments[0]==='uploads')&&segments[1]&&method==='GET'){
        if(user.role!=='admin') return json({error:'Admin access required'},403)
        return asset(segments[1],deps.uploadsDirectory)
      }
      if(segments[0]==='patterns'&&!segments[1]&&method==='POST'){
        if(user.role!=='admin') return json({error:'Admin access required'},403)
        return upload(req,deps.uploadsDirectory)
      }

      // Inventory (raw fabrics/materials) is admin-only; customers buy shop-products instead.
      if(segments[0]==='products'){
        if(user.role!=='admin') return json({error:'Admin access required'},403)
        if(method==='GET'&&segments.length===1){
          return json(await store().listProducts())
        }
        if(method==='GET'&&segments.length===2){
          const product=await store().getProduct(segments[1])
          if(!product) return json({error:'Not found'},404)
          return json(product)
        }
        if(method==='POST'&&segments.length===1){
          const product=await store().createProduct(productInputSchema.parse(await parseBody(req)))
          return json(product,201)
        }
        if(method==='PUT'&&segments.length===2){
          const patch=productUpdateSchema.parse(await parseBody(req))
          const previous=await store().getProduct(segments[1])
          const updated=await store().updateProduct(segments[1],patch)
          if(updated&&previous&&patch.stock!==undefined) await announceLowStock(store(),updated,previous.stock)
          return updated?json(updated):json({error:'Not found'},404)
        }
        if(method==='DELETE'&&segments.length===2){
          const ok=await store().deleteProduct(segments[1])
          return ok?json({message:'Deleted'}):json({error:'Not found'},404)
        }
        return json({error:'Method not allowed'},405)
      }

      if(segments[0]==='local-controller'){
        if(user.role!=='admin') return json({error:'Admin access required'},403)
        if(route==='local-controller/config'&&method==='GET') return json({enabled:true})
        const esp={fetchImpl:deps.esp32Fetch,baseUrl:deps.esp32BaseUrl}
        let result
        if(route==='local-controller/wifi/status'&&method==='GET') result=await esp32Request('status',esp)
        else if(route==='local-controller/wifi/stop'&&method==='POST') result=await esp32Request('stop',esp)
        else if(route==='local-controller/wifi/cmd'&&method==='POST'){
          const body=await parseBody(req) as {c?:unknown}
          try{result=await esp32Request('cmd',{...esp,command:typeof body?.c==='string'?body.c:''})}
          catch(error){return json({error:error instanceof Error?error.message:'Invalid command'},400)}
        }
        else return json({error:'Not found'},404)
        return json(result,result.ok?200:result.status)
      }

      if(segments[0]==='shop-products'){
        if(method==='GET'&&segments.length===1){
          const list=await store().listShopProducts()
          return json(user.role==='admin'?list:list.filter(p=>p.status==='active'))
        }
        if(method==='GET'&&segments.length===2){
          const product=await store().getShopProduct(segments[1])
          if(!product||(user.role!=='admin'&&product.status!=='active')) return json({error:'Not found'},404)
          return json(product)
        }
        if(user.role!=='admin') return json({error:'Admin access required'},403)
        if(method==='POST'&&segments.length===1){
          const raw=shopProductInputSchema.parse(await parseBody(req))
          // Explicit choices are validated as sent (an empty list is an error); omitted ones get defaults.
          const defaults=withGarmentDefaults({clothingType:raw.clothingType})
          const body={...raw,clothingType:raw.clothingType??defaults.clothingType,patternStyles:raw.patternStyles??defaults.patternStyles,sizes:raw.sizes??defaults.sizes}
          const garment=garmentError(body.clothingType,body.patternStyles,body.sizes)
          if(garment) return json({error:garment},400)
          const fabrics=await resolveFabrics(store(),body.fabrics)
          return json(await store().createShopProduct({...body,fabrics}),201)
        }
        if(method==='PUT'&&segments.length===2){
          const patch=shopProductUpdateSchema.parse(await parseBody(req))
          const existing=await store().getShopProduct(segments[1])
          if(!existing) return json({error:'Not found'},404)
          const {fabrics:rows,...rest}=patch
          const garment=garmentError(rest.clothingType??existing.clothingType,rest.patternStyles??existing.patternStyles,rest.sizes??existing.sizes)
          if(garment) return json({error:garment},400)
          const update=rows===undefined
            ? rest
            : {...rest,fabrics:await resolveFabrics(store(),rows,new Set(existing.fabrics.map(f=>f.inventoryItemId)))}
          const updated=await store().updateShopProduct(segments[1],update)
          return updated?json(updated):json({error:'Not found'},404)
        }
        if(method==='DELETE'&&segments.length===2){
          const ok=await store().deleteShopProduct(segments[1])
          return ok?json({message:'Deleted'}):json({error:'Not found'},404)
        }
        return json({error:'Method not allowed'},405)
      }

      if(segments[0]==='orders'){
        if(method==='GET'&&segments.length===1){
          const orders=user.role==='admin'
            ? await store().listOrders()
            : await store().listOrders({customerUid:user.uid,customerEmail:user.email})
          return json(orders)
        }
        if(method==='GET'&&segments.length===2){
          const order=await store().getOrder(segments[1])
          if(!order) return json({error:'Not found'},404)
          const allowed=user.role==='admin'||order.customerUid===user.uid||order.customerEmail.toLowerCase()===user.email.toLowerCase()
          if(!allowed) return json({error:'Not found'},404)
          return json(order)
        }
        if(method==='POST'&&segments.length===1){
          const body=placeOrderSchema.parse(await parseBody(req))
          const asAdmin=user.role==='admin'&&body.source==='admin'
          if(body.source==='admin'&&user.role!=='admin') return json({error:'Admin access required'},403)
          if(asAdmin&&(!body.customerName||!body.customerEmail)) return json({error:'Customer name and email are required for a walk-in order'},400)
          if(!asAdmin&&body.items.some(item=>item.kind==='inventory')) return json({error:'Inventory items are not for sale; order a product instead'},403)
          const order=await store().placeOrder({
            customerUid:asAdmin?`walkin:${(body.customerEmail||'').toLowerCase()}`:user.uid,
            customerEmail:asAdmin?(body.customerEmail||''):user.email,
            customerName:asAdmin?(body.customerName||''):user.name,
            items:body.items,
            note:body.note,
            source:asAdmin?'admin':'customer',
          })
          await announceOrderPlaced(store(),order)
          return json(order,201)
        }
        // Production: move one order line to the next/previous stage (admin only).
        if(method==='PATCH'&&segments.length===4&&segments[2]==='lines'){
          if(user.role!=='admin') return json({error:'Admin access required'},403)
          const index=Number(segments[3])
          if(!Number.isInteger(index)||index<0||index>49) return json({error:'Order line not found'},404)
          const body=lineProgressSchema.parse(await parseBody(req))
          const updated=await store().updateOrderLineProgress(segments[1],index,body.progress)
          if(!updated) return json({error:'Not found'},404)
          await announceLineProgress(store(),updated,index)
          return json(updated)
        }
        if((method==='PATCH'||method==='PUT')&&segments.length===2){
          const body=updateOrderSchema.parse(await parseBody(req))
          const existing=await store().getOrder(segments[1])
          if(!existing) return json({error:'Not found'},404)
          if(user.role!=='admin'){
            const allowed=existing.customerUid===user.uid||existing.customerEmail.toLowerCase()===user.email.toLowerCase()
            if(!allowed) return json({error:'Not found'},404)
            if(body.status!=='Cancelled'||body.note!==undefined) return json({error:'Admin access required'},403)
            if(existing.status!=='Pending') return json({error:'Only pending orders can be cancelled'},409)
            const updated=await store().updateOrder(segments[1],{status:'Cancelled'})
            if(updated) await announceOrderCancelledByCustomer(store(),updated)
            return updated?json(updated):json({error:'Not found'},404)
          }
          const updated=await store().updateOrder(segments[1],body)
          if(updated) await announceAdminOrderUpdate(store(),existing,updated)
          return updated?json(updated):json({error:'Not found'},404)
        }
        return json({error:'Method not allowed'},405)
      }

      if(route==='reports'&&method==='GET'){
        if(user.role!=='admin') return json({error:'Admin access required'},403)
        const [orders,products]=await Promise.all([store().listOrders(),store().listProducts()])
        const reports=buildReports(orders)
        const threshold=lowStockThreshold()
        const lowStock=products.filter(p=>p.active&&p.stock<=threshold)
        return json({...reports,productCount:products.length,lowStock,lowStockThreshold:threshold,catalogValue:products.reduce((sum,p)=>sum+p.price*p.stock,0)})
      }

      if(segments[0]==='notifications'){
        const recipient=user.role==='admin'?'admin':user.uid
        if(method==='GET'&&segments.length===1){
          const raw=Number(new URL(req.url).searchParams.get('limit')||20)
          const limit=Number.isFinite(raw)?Math.max(1,Math.min(raw,50)):20
          const [notifications,unread]=await Promise.all([
            store().listNotifications(recipient,limit),
            store().unreadCount(recipient),
          ])
          return json({notifications,unread,unreadCount:unread})
        }
        if(method==='POST'&&segments[1]==='read'&&segments.length===2){
          const body=markNotificationsReadSchema.parse(await parseBody(req))
          const count=await store().markNotificationsRead(recipient,body.all?'all':(body.ids||[]))
          const unread=await store().unreadCount(recipient)
          return json({ok:true,count,unread,unreadCount:unread})
        }
        return json({error:'Method not allowed'},405)
      }

      return json({error:'Not found'},404)
    }catch(error){
      if(error instanceof StoreError) return json({error:error.message},error.status)
      if(error instanceof ZodError) return json({error:error.issues.map(issue=>`${issue.path.join('.')||'body'}: ${issue.message}`).join('; ')},400)
      if(error instanceof SyntaxError) return json({error:'Invalid JSON'},400)
      if(error instanceof Error&&error.message==='BODY_TOO_LARGE') return json({error:'Body too large'},413)
      return json({error:'Request failed'},500)
    }
  }
}

export const handleApi=createHandler()
