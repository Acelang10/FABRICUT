"use client"
import {useEffect,useState} from 'react'
import {api} from '@/lib/client/api'
import {peso} from '@/lib/format'
import type {ShopOrder} from '@/lib/types'
import {styleLabel} from '@/lib/clothing'
import ProgressPipeline from '../ProgressPipeline'

export default function CustomerOrdersView(){
  const [orders,setOrders]=useState<ShopOrder[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [busyId,setBusyId]=useState('')

  function load(){
    return api<ShopOrder[]>('/orders')
      .then(setOrders)
      .catch(e=>setError(e instanceof Error?e.message:'Orders unavailable'))
  }

  useEffect(()=>{
    load().finally(()=>setLoading(false))
  },[])

  async function cancel(order:ShopOrder){
    if(order.status!=='Pending') return
    if(!window.confirm('Cancel this pending order? Stock will be returned to the shop.')) return
    setBusyId(order.id)
    setError('')
    try{
      await api(`/orders/${encodeURIComponent(order.id)}`,'PATCH',{status:'Cancelled'})
      await load()
    }catch(e){
      setError(e instanceof Error?e.message:'Could not cancel the order')
    }finally{
      setBusyId('')
    }
  }

  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>My Orders</h1>
          <p>Track status after checkout. Pickup is at the J.C.M. Tailoring workshop in Victoria, Oriental Mindoro.</p>
        </div>
      </div>
      {loading?<p role="status">Loading your orders…</p>:null}
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {!loading&&orders.length===0?<p className="atelier-empty">You have no orders yet. Add items to your cart and check out from Products.</p>:null}
      {orders.map(order=>(
        <article key={order.id} className="atelier-tile atelier-order-card">
          <div className="atelier-head">
            <h2>Order · {new Date(order.createdAt||Date.now()).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</h2>
            <span className={`atelier-tag ${order.status==='Cutting'||order.status==='To cut'?'cut':''}`}>{order.status}</span>
          </div>
          <ul className="order-lines">{order.items.map((item,index)=>(
            <li key={index}>
              <div>{item.name} × {item.qty} · {peso(item.price*item.qty)}{item.size||item.style?<span className="atelier-muted"> · {[item.size?`Size ${item.size}`:'',item.style?styleLabel(item.clothingType,item.style):''].filter(Boolean).join(' · ')}</span>:null}</div>
              {item.kind==='product'&&order.status!=='Cancelled'?<ProgressPipeline stage={item.progress||'Queued'} compact/>:null}
            </li>
          ))}</ul>
          <p className="atelier-px">Total {peso(order.total)}</p>
          {order.note?<p className="atelier-muted">{order.note}</p>:null}
          {order.status==='Pending'?(
            <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" disabled={busyId===order.id} onClick={()=>void cancel(order)}>
              {busyId===order.id?'Cancelling…':'Cancel order'}
            </button>
          ):null}
        </article>
      ))}
    </>
  )
}
