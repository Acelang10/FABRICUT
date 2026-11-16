import type {OrderStatus,Product,ShopOrder} from '../types'
import {peso} from '../format'

export interface MailPayload {
  to:string
  subject:string
  text:string
  html:string
}

export interface MailTransport {
  sendMail(payload:MailPayload&{from:string}):Promise<unknown>
}

let testTransport:MailTransport|undefined

export function setMailTransportForTests(transport?:MailTransport){
  testTransport=transport
}

export function emailNotificationsEnabled(){
  const flag=(process.env.EMAIL_NOTIFICATIONS||'off').trim().toLowerCase()
  return flag==='on'||flag==='true'||flag==='1'
}

export function emailFromAddress(){
  return (process.env.EMAIL_FROM||process.env.SMTP_USER||'').trim()
}

export function adminNotifyEmail(){
  return (process.env.ADMIN_NOTIFY_EMAIL||'').trim()
}

function smtpConfigured(){
  return Boolean((process.env.SMTP_HOST||'').trim()&&(process.env.SMTP_USER||'').trim()&&(process.env.SMTP_PASS||'').trim())
}

export async function createSmtpTransport():Promise<MailTransport|null>{
  if(!smtpConfigured()) return null
  const nodemailer=await import('nodemailer')
  const parsed=Number(process.env.SMTP_PORT||465)
  const port=Number.isFinite(parsed)&&parsed>0?parsed:465
  const transporter=nodemailer.createTransport({
    host:process.env.SMTP_HOST,
    port,
    secure:port===465,
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},
  })
  return {async sendMail(payload){await transporter.sendMail(payload)}}
}

export async function sendNotificationEmail(payload:MailPayload,transport?:MailTransport){
  try{
    if(!emailNotificationsEnabled()){
      console.info('FABRICUT: email notifications are off; skipped send')
      return {skipped:true as const}
    }
    const to=payload.to.trim()
    if(!to){
      console.info('FABRICUT: email notifications skipped; missing recipient')
      return {skipped:true as const}
    }
    const from=emailFromAddress()
    const mailer=transport||testTransport||await createSmtpTransport()
    if(!mailer||!from){
      console.info('FABRICUT: email notifications are on but SMTP is not configured; skipped send')
      return {skipped:true as const}
    }
    await mailer.sendMail({...payload,to,from})
    return {sent:true as const}
  }catch(error){
    console.warn('FABRICUT: email send failed:',error instanceof Error?error.message:String(error))
    return {failed:true as const}
  }
}

function escapeHtml(value:string){
  return value.replace(/[&<>"']/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]!))
}

function wrapHtml(title:string,body:string){
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#FFFEF6;color:#0B1630;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #EEE7C8;border-radius:22px;padding:24px">
    <div style="font-weight:800;letter-spacing:-0.03em;font-size:20px;color:#0F1F4A">FABRI<span style="color:#1D4ED8">CUT</span></div>
    <h1 style="font-size:18px;margin:16px 0 8px;color:#0F1F4A">${escapeHtml(title)}</h1>
    <div style="font-size:14px;line-height:1.55;color:#3E4A68">${body}</div>
    <p style="margin-top:24px;font-size:12px;color:#3E4A68">J.C.M. Tailoring · Victoria, Oriental Mindoro</p>
  </div>
</body></html>`
}

function itemSummary(order:ShopOrder){
  return order.items.map(item=>`${item.name} × ${item.qty}`).join(', ')
}

export function orderPlacedAdminEmail(order:ShopOrder):MailPayload{
  const who=order.source==='admin'
    ?`Walk-in order for ${order.customerName||order.customerEmail||'a customer'}`
    :`New customer order from ${order.customerEmail||'a customer'}`
  const text=`${who}. Total ${peso(order.total)}. Items: ${itemSummary(order)}.`
  return {
    to:adminNotifyEmail(),
    subject:`FABRICUT · New order · ${peso(order.total)}`,
    text,
    html:wrapHtml('New order',`<p>${escapeHtml(who)}.</p><p>Total <strong>${escapeHtml(peso(order.total))}</strong></p><p>${escapeHtml(itemSummary(order))}</p>`),
  }
}

export function orderPlacedCustomerEmail(order:ShopOrder):MailPayload{
  const text=`We received your order for ${peso(order.total)}. Items: ${itemSummary(order)}. We’ll update you as it moves through the workshop.`
  return {
    to:order.customerEmail||'',
    subject:`FABRICUT · Order received · ${peso(order.total)}`,
    text,
    html:wrapHtml('Order received',`<p>We received your order for <strong>${escapeHtml(peso(order.total))}</strong>.</p><p>${escapeHtml(itemSummary(order))}</p><p>We’ll update you as it moves through the workshop. Pickup is at the J.C.M. Tailoring workshop in Victoria, Oriental Mindoro.</p>`),
  }
}

export function orderCancelledAdminEmail(order:ShopOrder):MailPayload{
  const who=order.customerEmail||order.customerName||'A customer'
  const text=`${who} cancelled their order for ${peso(order.total)}.`
  return {
    to:adminNotifyEmail(),
    subject:'FABRICUT · Order cancelled by customer',
    text,
    html:wrapHtml('Order cancelled',`<p>${escapeHtml(who)} cancelled their order for <strong>${escapeHtml(peso(order.total))}</strong>.</p><p>${escapeHtml(itemSummary(order))}</p>`),
  }
}

export function orderStatusCustomerEmail(order:ShopOrder,previous:OrderStatus):MailPayload{
  const text=`Your order status changed from ${previous} to ${order.status}. Total ${peso(order.total)}.`
  return {
    to:order.customerEmail||'',
    subject:`FABRICUT · Order ${order.status}`,
    text,
    html:wrapHtml(`Order ${order.status}`,`<p>Your order is now <strong>${escapeHtml(order.status)}</strong> (was ${escapeHtml(previous)}).</p><p>Total ${escapeHtml(peso(order.total))}.</p><p>${escapeHtml(itemSummary(order))}</p>`),
  }
}

export function lowStockAdminEmail(product:Product,threshold:number):MailPayload{
  const text=`${product.name} is low on stock: ${product.stock} ${product.unit} left (threshold ${threshold}).`
  return {
    to:adminNotifyEmail(),
    subject:`FABRICUT · Low stock · ${product.name}`,
    text,
    html:wrapHtml('Low stock',`<p><strong>${escapeHtml(product.name)}</strong> is down to <strong>${product.stock} ${escapeHtml(product.unit)}</strong> (threshold ${threshold}).</p>`),
  }
}
