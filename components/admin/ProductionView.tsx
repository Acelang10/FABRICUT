"use client"
import {useEffect,useMemo,useState} from 'react'
import {api} from '@/lib/client/api'
import {peso} from '@/lib/format'
import {round2} from '@/lib/fabrics'
import {clothingLabel,nextStage,previousStage,styleLabel,type ProductionStage} from '@/lib/clothing'
import type {OrderItem,ShopOrder} from '@/lib/types'
import GarmentPattern from '../GarmentPattern'
import ProgressPipeline from '../ProgressPipeline'

type Filter='active'|'all'
const stageOf=(item:OrderItem):ProductionStage=>item.progress||'Queued'

/** Production board: every garment line on every open order, with shirt details and a stage pipeline. */
export default function ProductionView(){
  const [orders,setOrders]=useState<ShopOrder[]>([])
  const [filter,setFilter]=useState<Filter>('active')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')

  async function refresh(){ setOrders(await api<ShopOrder[]>('/orders')) }
  useEffect(()=>{ refresh().catch(e=>setError(e instanceof Error?e.message:'Orders unavailable')).finally(()=>setLoading(false)) },[])

  const visible=useMemo(()=>orders
    .filter(o=>o.status!=='Cancelled')
    .filter(o=>filter==='all'||o.items.some(i=>stageOf(i)!=='Delivered')),[orders,filter])

  const counts=useMemo(()=>{
    const c:Record<string,number>={}
    for(const o of orders) if(o.status!=='Cancelled') for(const i of o.items) c[stageOf(i)]=(c[stageOf(i)]||0)+i.qty
    return c
  },[orders])

  async function move(order:ShopOrder,index:number,stage:ProductionStage){
    const key=`${order.id}:${index}`
    setBusy(key);setError('')
    try{
      const updated=await api<ShopOrder>(`/orders/${encodeURIComponent(order.id)}/lines/${index}`,'PATCH',{progress:stage})
      setOrders(list=>list.map(o=>o.id===updated.id?updated:o))
    }catch(e){ setError(e instanceof Error?e.message:'Could not update progress') }
    finally{ setBusy('') }
  }

  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>Production</h1>
          <p>Progress of each ordered item. Moving a step tells the customer in their notifications.</p>
        </div>
        <div className="atelier-chips">
          <button type="button" className={filter==='active'?'on':undefined} onClick={()=>setFilter('active')}>In progress</button>
          <button type="button" className={filter==='all'?'on':undefined} onClick={()=>setFilter('all')}>All</button>
        </div>
      </div>
      <div className="prod-counts" aria-label="Items per stage">
        {(['Queued','Cutting','Sewing','Finishing','Ready','Delivered'] as ProductionStage[]).map(s=>(
          <div key={s}><b>{counts[s]||0}</b><span>{s}</span></div>
        ))}
      </div>
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {loading?<p role="status">Loading production…</p>:null}
      {!loading&&visible.length===0?<p className="atelier-empty">{filter==='active'?'Nothing in production right now.':'No orders yet.'}</p>:null}
      {visible.map(order=>(
        <article key={order.id} className="atelier-tile prod-order">
          <div className="atelier-head">
            <div>
              <h2>{order.customerName||order.customerEmail}</h2>
              <p className="atelier-muted">{order.customerEmail} · {new Date(order.createdAt||Date.now()).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} · {order.source==='admin'?'walk-in':'online'}</p>
            </div>
            <span className="atelier-tag">{order.status}</span>
          </div>
          {order.note?<p className="prod-note"><b>Note:</b> {order.note}</p>:null}
          {order.items.map((item,index)=>{
            const stage=stageOf(item)
            const next=nextStage(stage),prev=previousStage(stage)
            const key=`${order.id}:${index}`
            const garment=item.kind==='product'
            return (
              <div key={index} className="prod-line">
                {garment&&item.clothingType?<GarmentPattern type={item.clothingType} style={item.style||''} size="sm"/>:<div className="prod-noart" aria-hidden="true">Raw</div>}
                <div className="prod-info">
                  <h3>{item.name} <span className="atelier-muted">× {item.qty}</span></h3>
                  <dl className="prod-details">
                    {garment?<>
                      <div><dt>Type</dt><dd>{clothingLabel(item.clothingType)}</dd></div>
                      <div><dt>Pattern</dt><dd>{styleLabel(item.clothingType,item.style)||'—'}</dd></div>
                      <div><dt>Size</dt><dd className="prod-size">{item.size||'—'}</dd></div>
                      {item.color?<div><dt>Color</dt><dd>{item.color}</dd></div>:null}
                      {item.chosenFabric?<div className="prod-wide"><dt>Fabric</dt><dd>{item.chosenFabric.name}</dd></div>:null}
                    </>:<div><dt>Item</dt><dd>Inventory (raw material)</dd></div>}
                    <div><dt>Amount</dt><dd>{peso(item.price*item.qty)}</dd></div>
                    {!item.chosenFabric&&item.fabrics?.some(f=>f.quantity>0)?<div className="prod-wide"><dt>Fabrics</dt><dd>{item.fabrics.filter(f=>f.quantity>0).map(f=>`${f.name} ${round2(f.quantity*item.qty)} ${f.unit}`).join(', ')}</dd></div>:null}
                  </dl>
                  <ProgressPipeline stage={stage}/>
                  <div className="atelier-dialog-actions lc-left">
                    <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" disabled={!prev||busy===key} onClick={()=>prev&&void move(order,index,prev)}>← {prev||'Back'}</button>
                    <button type="button" className="atelier-btn atelier-btn-y atelier-btn-sm" disabled={!next||busy===key} onClick={()=>next&&void move(order,index,next)}>{next?`Move to ${next} →`:'Delivered ✓'}</button>
                  </div>
                </div>
              </div>
            )
          })}
        </article>
      ))}
    </>
  )
}
