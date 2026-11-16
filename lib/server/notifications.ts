import {DEFAULT_LOW_STOCK_THRESHOLD,type Product,type ShopOrder,type ShopNotification,type NotificationType} from '../types'
import {peso} from '../format'
import type {ShopStore} from './store'
import {inventoryUsage,round2} from '../fabrics'
import {
  lowStockAdminEmail,
  orderCancelledAdminEmail,
  orderPlacedAdminEmail,
  orderPlacedCustomerEmail,
  orderStatusCustomerEmail,
  sendNotificationEmail,
} from './email'

export function lowStockThreshold(){
  const raw=process.env.LOW_STOCK_THRESHOLD
  if(raw==null||raw.trim()==='') return DEFAULT_LOW_STOCK_THRESHOLD
  const n=Number(raw)
  return Number.isFinite(n)&&n>=0?Math.floor(n):DEFAULT_LOW_STOCK_THRESHOLD
}

interface Draft {
  recipient:string
  customerEmail?:string
  type:NotificationType
  title:string
  message:string
  link:string
}

async function safeCreate(store:ShopStore,draft:Draft):Promise<ShopNotification|null>{
  try{
    return await store.createNotification(draft)
  }catch(error){
    console.warn('FABRICUT: failed to store notification:',error instanceof Error?error.message:String(error))
    return null
  }
}

function queueEmail(payload:Parameters<typeof sendNotificationEmail>[0]){
  void sendNotificationEmail(payload)
}

export async function announceLowStock(store:ShopStore,product:Product,previousStock:number){
  const threshold=lowStockThreshold()
  if(!(previousStock>threshold&&product.stock<=threshold)) return
  const unit=product.unit||'units'
  await safeCreate(store,{
    recipient:'admin',
    type:'low_stock',
    title:`Low stock: ${product.name}`,
    message:`Only ${product.stock} ${unit} left (threshold ${threshold}).`,
    link:'/admin/inventory',
  })
  queueEmail(lowStockAdminEmail(product,threshold))
}

/** Low-stock check for every inventory item (fabric) an order consumed. */
async function announceInventoryUsage(store:ShopStore,order:ShopOrder){
  for(const [id,used] of inventoryUsage(order.items)){
    const item=await store.getProduct(id).catch(()=>null)
    if(item) await announceLowStock(store,item,round2(item.stock+used))
  }
}

export async function announceOrderPlaced(store:ShopStore,order:ShopOrder){
  const items=order.items.map(item=>`${item.name} × ${item.qty}`).join(', ')
  const who=order.source==='admin'
    ?(order.customerName||order.customerEmail||'Walk-in customer')
    :(order.customerEmail||'A customer')
  const title=order.source==='admin'?'Walk-in order':'New order'
  await safeCreate(store,{
    recipient:'admin',
    customerEmail:order.customerEmail,
    type:'order_placed',
    title,
    message:`${who} placed an order for ${peso(order.total)} (${items}).`,
    link:'/admin/orders',
  })
  if(order.customerUid){
    await safeCreate(store,{
      recipient:order.customerUid,
      customerEmail:order.customerEmail,
      type:'order_placed',
      title:'Order placed',
      message:`We received your order for ${peso(order.total)}. We’ll update you as it moves through the workshop.`,
      link:'/shop/orders',
    })
  }
  queueEmail(orderPlacedAdminEmail(order))
  if(order.customerEmail) queueEmail(orderPlacedCustomerEmail(order))

  await announceInventoryUsage(store,order)
}

/** Tell the customer when one garment on their order moves to a new production stage. */
export async function announceLineProgress(store:ShopStore,order:ShopOrder,lineIndex:number){
  const line=order.items[lineIndex]
  if(!line||!order.customerUid||order.customerUid.startsWith('walkin:')) return
  const stage=line.progress||'Queued'
  const detail=[line.size?`size ${line.size}`:'',line.qty>1?`× ${line.qty}`:''].filter(Boolean).join(' ')
  await safeCreate(store,{
    recipient:order.customerUid,
    customerEmail:order.customerEmail,
    type:'order_status',
    title:`${line.name}: ${stage}`,
    message:`Your ${line.name}${detail?` (${detail})`:''} is now ${stage}.`,
    link:'/shop/orders',
  })
}

export async function announceOrderCancelledByCustomer(store:ShopStore,order:ShopOrder){
  const who=order.customerEmail||order.customerName||'A customer'
  await safeCreate(store,{
    recipient:'admin',
    customerEmail:order.customerEmail,
    type:'order_cancelled',
    title:'Order cancelled',
    message:`${who} cancelled their order for ${peso(order.total)}.`,
    link:'/admin/orders',
  })
  queueEmail(orderCancelledAdminEmail(order))
}

export async function announceAdminOrderUpdate(store:ShopStore,previous:ShopOrder,updated:ShopOrder){
  if(previous.status===updated.status) return
  if(updated.customerUid){
    await safeCreate(store,{
      recipient:updated.customerUid,
      customerEmail:updated.customerEmail,
      type:'order_status',
      title:`Order ${updated.status}`,
      message:`Your order is now ${updated.status} (was ${previous.status}).`,
      link:'/shop/orders',
    })
  }
  if(updated.customerEmail) queueEmail(orderStatusCustomerEmail(updated,previous.status))

  if(previous.status==='Cancelled'&&updated.status!=='Cancelled') await announceInventoryUsage(store,updated)
}
