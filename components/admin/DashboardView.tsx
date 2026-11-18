"use client"
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {api} from '@/lib/client/api'
import {peso} from '@/lib/format'
import {LOW_STOCK_THRESHOLD,type Product,type ShopOrder} from '@/lib/types'
import FabricThumb from './FabricThumb'

interface Reports {
  weekRevenue:number
  openOrders:number
  productCount:number
  catalogValue:number
  lowStock:Product[]
}

export default function DashboardView(){
  const [products,setProducts]=useState<Product[]>([])
  const [orders,setOrders]=useState<ShopOrder[]>([])
  const [reports,setReports]=useState<Reports|null>(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    let active=true
    Promise.all([api<Product[]>('/products'),api<ShopOrder[]>('/orders'),api<Reports>('/reports')])
      .then(([p,o,r])=>{if(!active)return;setProducts(p);setOrders(o);setReports(r)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Dashboard unavailable')})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[])

  const today=new Date().toLocaleDateString('en-PH',{weekday:'long',day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Manila'})
  const low=reports?.lowStock||products.filter(p=>p.active&&p.stock<=LOW_STOCK_THRESHOLD)

  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>Dashboard</h1>
          <p>J.C.M. Tailoring · {today}</p>
        </div>
      </div>
      {loading?<p role="status">Loading dashboard…</p>:null}
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {!loading&&!error?(
        <div className="atelier-bento">
          <section className="atelier-tile atelier-inv">
            <div className="atelier-head">
              <h2>Inventory</h2>
              <Link href="/admin/inventory" className="atelier-btn atelier-btn-y atelier-btn-sm">+ Add fabric</Link>
            </div>
            {products.length===0?<p className="atelier-empty">No fabrics yet. Add the first fabric in Inventory.</p>:
              <div className="atelier-plist">
                {products.map(product=>(
                  <Link key={product.id} href="/admin/inventory" className="atelier-row">
                    <FabricThumb product={product}/>
                    <div>
                      <strong>{product.name}</strong>
                      <span className={product.stock<=LOW_STOCK_THRESHOLD?'atelier-low':undefined}>
                        {product.stock} {product.unit}{product.stock<=LOW_STOCK_THRESHOLD?' · low':''}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>}
          </section>
          <section className="atelier-tile">
            <h2>Today at a glance</h2>
            <div className="atelier-kpis">
              <div><span>Open orders</span><b>{reports?.openOrders??0}</b></div>
              <div><span>Low stock</span><b>{low.length}</b></div>
              <div><span>Revenue (wk)</span><b>{peso(reports?.weekRevenue??0)}</b></div>
              <div><span>Products</span><b>{reports?.productCount??products.length}</b></div>
            </div>
          </section>
          <section className="atelier-tile atelier-ctrl">
            <h2>Control</h2>
            <p>USB · <span className="atelier-live">Unknown</span></p>
            <p>Status is only available on the Control page. This card never auto-connects or arms the cutter.</p>
            <p>Laser · unknown · work area 444.5 × 650 mm</p>
            <div className="atelier-acts">
              <Link href="/admin/control" className="pri">Open Control</Link>
            </div>
          </section>
          <section className="atelier-tile atelier-orders-tile">
            <div className="atelier-head">
              <h2>Orders</h2>
              <Link href="/admin/orders" className="atelier-btn atelier-btn-b atelier-btn-sm">+ Add order</Link>
            </div>
            {orders.length===0?<p className="atelier-empty">No orders yet.</p>:
              orders.slice(0,8).map(order=>(
                <div key={order.id} className="atelier-oline">
                  <b>{order.customerName||order.customerEmail} · {order.items.map(i=>i.name).join(', ')}</b>
                  <span className={`atelier-tag ${order.status==='Cutting'||order.status==='To cut'?'cut':''}`}>{order.status}</span>
                  <span className="atelier-px">{peso(order.total)}</span>
                </div>
              ))}
          </section>
        </div>
      ):null}
    </>
  )
}
