"use client"
import {useEffect,useMemo,useState} from 'react'
import {api} from '@/lib/client/api'
import {peso} from '@/lib/format'
import {lineChoiceLabel} from '@/lib/fabrics'
import {styleLabel} from '@/lib/clothing'
import {ORDER_STATUSES,type OrderStatus,type Product,type ShopOrder,type ShopProduct} from '@/lib/types'

const filters:('All'|OrderStatus)[]=['All',...ORDER_STATUSES]

export default function OrdersView(){
  const [orders,setOrders]=useState<ShopOrder[]>([])
  const [products,setProducts]=useState<Product[]>([])
  const [shopProducts,setShopProducts]=useState<ShopProduct[]>([])
  const [filter,setFilter]=useState<'All'|OrderStatus>('All')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [customerName,setCustomerName]=useState('')
  const [customerEmail,setCustomerEmail]=useState('')
  const [note,setNote]=useState('')
  const [lines,setLines]=useState<{productId:string;qty:string}[]>([{productId:'',qty:'1'}])

  async function refresh(){
    const [list,catalog,sellable]=await Promise.all([api<ShopOrder[]>('/orders'),api<Product[]>('/products'),api<ShopProduct[]>('/shop-products')])
    setOrders(list)
    setProducts(catalog)
    setShopProducts(sellable)
  }

  useEffect(()=>{
    refresh().catch(e=>setError(e instanceof Error?e.message:'Orders unavailable')).finally(()=>setLoading(false))
  },[])

  const visible=useMemo(()=>filter==='All'?orders:orders.filter(o=>o.status===filter),[orders,filter])

  async function changeStatus(order:ShopOrder,status:OrderStatus){
    setError('')
    try{
      await api(`/orders/${encodeURIComponent(order.id)}`,'PATCH',{status})
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not update order')}
  }

  async function create(e:React.FormEvent){
    e.preventDefault()
    setBusy(true);setError('')
    try{
      // Option values are "product:<id>" (sellable product) or "inventory:<id>" (raw inventory sold over the counter).
      const items=lines.filter(l=>l.productId).map(l=>{
        const [kind,...rest]=l.productId.split(':')
        return {productId:rest.join(':'),kind:kind==='inventory'?'inventory':'product',qty:Number(l.qty)}
      })
      await api('/orders','POST',{items,customerName,customerEmail,note,source:'admin'})
      setOpen(false)
      setCustomerName('');setCustomerEmail('');setNote('');setLines([{productId:'',qty:'1'}])
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not add order')}
    finally{setBusy(false)}
  }

  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>Orders</h1>
          <p>Update status or add a walk-in order.</p>
        </div>
        <button type="button" className="atelier-btn atelier-btn-b" onClick={()=>setOpen(true)}>+ Add order</button>
      </div>
      <div className="atelier-chips">
        {filters.map(name=>(
          <button type="button" key={name} className={filter===name?'on':undefined} onClick={()=>setFilter(name)}>{name}</button>
        ))}
      </div>
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {loading?<p role="status">Loading orders…</p>:null}
      {!loading&&visible.length===0?<p className="atelier-empty">No orders{filter==='All'?' yet':' with this status'}.</p>:null}
      {visible.map(order=>(
        <article key={order.id} className="atelier-tile atelier-order-card">
          <div className="atelier-head">
            <h2>{order.customerName||order.customerEmail}</h2>
            <span className={`atelier-tag ${order.status==='Cutting'||order.status==='To cut'?'cut':''}`}>{order.status}</span>
          </div>
          <p className="atelier-muted">{order.customerEmail} · {order.source} · {new Date(order.createdAt||Date.now()).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p>
          <ul>{order.items.map((item,index)=>{
            const choices=lineChoiceLabel(item,styleLabel(item.clothingType,item.style))
            const legacy=item.fabrics?.filter(f=>f.quantity>0).map(f=>`${f.name} ${Math.round(f.quantity*item.qty*100)/100} ${f.unit}`).join(', ')
            return <li key={item.productId+item.name+index}>{item.name} × {item.qty} · {peso(item.price*item.qty)}{choices?<span className="atelier-muted"> · {choices}</span>:null}{legacy&&!item.chosenFabric?<span className="atelier-muted"> · uses {legacy}</span>:null}</li>
          })}</ul>
          <p className="atelier-px">Total {peso(order.total)}</p>
          {order.note?<p className="atelier-muted">{order.note}</p>:null}
          <label className="atelier-status-label">Update status
            <select value={order.status} onChange={e=>void changeStatus(order,e.target.value as OrderStatus)}>
              {ORDER_STATUSES.map(status=><option key={status}>{status}</option>)}
            </select>
          </label>
        </article>
      ))}
      {open?(
        <div className="atelier-modal" role="dialog" aria-modal="true" aria-labelledby="add-order-title">
          <form className="atelier-dialog" onSubmit={e=>void create(e)}>
            <h2 id="add-order-title">Add walk-in order</h2>
            <label>Customer name<input value={customerName} onChange={e=>setCustomerName(e.target.value)} required/></label>
            <label>Customer email<input type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} required/></label>
            {lines.map((line,index)=>(
              <div className="atelier-form-row" key={index}>
                <label>Product
                  <select value={line.productId} onChange={e=>setLines(lines.map((l,i)=>i===index?{...l,productId:e.target.value}:l))}>
                    <option value="">Select a product</option>
                    <optgroup label="Products">
                      {shopProducts.filter(p=>p.status==='active').map(p=><option key={p.id} value={`product:${p.id}`} disabled={p.stock<=0}>{p.name} · {peso(p.price)} · {p.stock} available</option>)}
                    </optgroup>
                    <optgroup label="Fabrics (inventory)">
                      {products.filter(p=>p.active).map(p=><option key={p.id} value={`inventory:${p.id}`} disabled={p.stock<=0}>{p.name} · {p.stock} {p.unit}</option>)}
                    </optgroup>
                  </select>
                </label>
                <label>Qty<input type="number" min="1" value={line.qty} onChange={e=>setLines(lines.map((l,i)=>i===index?{...l,qty:e.target.value}:l))}/></label>
              </div>
            ))}
            <button type="button" className="atelier-btn atelier-btn-ghost" onClick={()=>setLines([...lines,{productId:'',qty:'1'}])}>+ Another item</button>
            <label>Note<textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}/></label>
            <div className="atelier-dialog-actions">
              <button type="button" className="atelier-btn atelier-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
              <button type="submit" className="atelier-btn atelier-btn-b" disabled={busy}>{busy?'Placing…':'Place order'}</button>
            </div>
          </form>
        </div>
      ):null}
    </>
  )
}
