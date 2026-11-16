"use client"
import {useEffect,useState} from 'react'
import {api} from '@/lib/client/api'
import {peso} from '@/lib/format'
import {ORDER_STATUSES,type OrderStatus,type Product} from '@/lib/types'

interface Reports {
  byStatus:Record<OrderStatus,number>
  days:{date:string;total:number}[]
  weeks:{week:string;total:number}[]
  topProducts:{name:string;qty:number;revenue:number}[]
  weekRevenue:number
  openOrders:number
  orderCount:number
  productCount:number
  catalogValue:number
  lowStock:Product[]
}

export default function ReportsView(){
  const [reports,setReports]=useState<Reports|null>(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    api<Reports>('/reports')
      .then(setReports)
      .catch(e=>setError(e instanceof Error?e.message:'Reports unavailable'))
      .finally(()=>setLoading(false))
  },[])

  const maxDay=Math.max(1,...(reports?.days.map(d=>d.total)||[0]))
  const maxStatus=Math.max(1,...ORDER_STATUSES.map(s=>reports?.byStatus[s]||0))

  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>Reports</h1>
          <p>Sales totals from stored orders. Pending and cancelled orders are not counted as revenue.</p>
        </div>
      </div>
      {loading?<p role="status">Loading reports…</p>:null}
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {reports&&reports.orderCount===0?<p className="atelier-empty">No order data yet. Reports will appear after the first sale or walk-in order.</p>:null}
      {reports?(
        <div className="atelier-report-grid">
          <section className="atelier-tile">
            <h2>Totals</h2>
            <div className="atelier-kpis">
              <div><span>Revenue (7 days)</span><b>{peso(reports.weekRevenue)}</b></div>
              <div><span>Open orders</span><b>{reports.openOrders}</b></div>
              <div><span>All orders</span><b>{reports.orderCount}</b></div>
              <div><span>Catalog value</span><b>{peso(reports.catalogValue)}</b></div>
            </div>
          </section>
          <section className="atelier-tile">
            <h2>Sales by day</h2>
            {reports.days.length===0?<p className="atelier-empty">No daily sales yet.</p>:
              <ul className="atelier-bars">
                {reports.days.map(day=>(
                  <li key={day.date}>
                    <span>{day.date.slice(5)}</span>
                    <i style={{width:`${Math.max(6,(day.total/maxDay)*100)}%`}}/>
                    <b>{peso(day.total)}</b>
                  </li>
                ))}
              </ul>}
          </section>
          <section className="atelier-tile">
            <h2>Orders by status</h2>
            <ul className="atelier-bars">
              {ORDER_STATUSES.map(status=>(
                <li key={status}>
                  <span>{status}</span>
                  <i style={{width:`${Math.max(reports.byStatus[status]?8:0,(reports.byStatus[status]/maxStatus)*100)}%`}}/>
                  <b>{reports.byStatus[status]}</b>
                </li>
              ))}
            </ul>
          </section>
          <section className="atelier-tile">
            <h2>Top products</h2>
            {reports.topProducts.length===0?<p className="atelier-empty">No product sales yet.</p>:
              <table className="atelier-table">
                <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
                <tbody>
                  {reports.topProducts.map(row=>(
                    <tr key={row.name}><td>{row.name}</td><td>{row.qty}</td><td>{peso(row.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>}
          </section>
        </div>
      ):null}
    </>
  )
}
