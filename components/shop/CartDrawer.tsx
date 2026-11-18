"use client"
import {useState} from 'react'
import {useRouter} from 'next/navigation'
import {api} from '@/lib/client/api'
import {cartTotal,lineKey,writeCart,type CartLine} from '@/lib/client/cart'
import {styleLabel} from '@/lib/clothing'
import {peso} from '@/lib/format'

export default function CartDrawer({open,uid,lines,onClose,onChange}:{open:boolean;uid:string;lines:CartLine[];onClose:()=>void;onChange:()=>void}){
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const router=useRouter()

  function update(next:CartLine[]){
    writeCart(uid,next)
    window.dispatchEvent(new Event('fabricut-cart'))
    onChange()
  }

  function setQty(key:string,qty:number){
    if(qty<=0) update(lines.filter(line=>lineKey(line)!==key))
    else update(lines.map(line=>lineKey(line)===key?{...line,qty}:line))
  }

  async function checkout(){
    if(!lines.length) return
    setBusy(true);setError('')
    try{
      await api('/orders','POST',{items:lines.map(line=>({productId:line.productId,qty:line.qty,kind:'product',...(line.size?{size:line.size}:{}),...(line.style?{style:line.style}:{}),...(line.color?{color:line.color}:{}),...(line.fabricId?{fabricId:line.fabricId}:{})}))})
      writeCart(uid,[])
      window.dispatchEvent(new Event('fabricut-cart'))
      onChange()
      onClose()
      router.push('/shop/orders')
    }catch(err){setError(err instanceof Error?err.message:'Could not place order')}
    finally{setBusy(false)}
  }

  if(!open) return null
  return (
    <div className="atelier-drawer-back" onClick={onClose}>
      <aside className="atelier-drawer" role="dialog" aria-label="Your cart" onClick={e=>e.stopPropagation()}>
        <div className="atelier-head">
          <h2>Your cart</h2>
          <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" onClick={onClose}>Close</button>
        </div>
        {lines.length===0?<p className="atelier-empty">Your cart is empty.</p>:null}
        {lines.map(line=>(
          <div key={lineKey(line)} className="atelier-cart-line">
            {line.imageUrl
              // eslint-disable-next-line @next/next/no-img-element
              ?<img src={line.imageUrl} alt="" className="atelier-swatch atelier-photo" referrerPolicy="no-referrer"/>
              :<span className="atelier-swatch kit"/>}
            <div>
              <strong>{line.name}</strong>
              <span>{[line.fabricName,line.color,line.style?styleLabel(line.clothingType,line.style):'',line.size?`Size ${line.size}`:''].filter(Boolean).join(' · ')} · {line.qty} × {peso(line.price)} each</span>
            </div>
            <div className="atelier-qty">
              <button type="button" onClick={()=>setQty(lineKey(line),line.qty-1)} aria-label="Decrease">−</button>
              <b>{line.qty}</b>
              <button type="button" onClick={()=>setQty(lineKey(line),line.qty+1)} aria-label="Increase">+</button>
            </div>
            <button type="button" className="atelier-remove" onClick={()=>setQty(lineKey(line),0)}>Remove</button>
          </div>
        ))}
        <div className="atelier-cart-foot">
          <div className="atelier-sum"><span>Subtotal</span><b>{peso(cartTotal(lines))}</b></div>
          <div className="atelier-sum muted"><span>Pickup in Victoria</span><b>₱0</b></div>
          <div className="atelier-sum total"><span>Total</span><b>{peso(cartTotal(lines))}</b></div>
          {error?<p className="atelier-error" role="alert">{error}</p>:null}
          <button type="button" className="atelier-btn atelier-btn-b atelier-btn-block" disabled={busy||!lines.length} onClick={()=>void checkout()}>
            {busy?'Placing order…':'Checkout · place order'}
          </button>
        </div>
      </aside>
    </div>
  )
}
