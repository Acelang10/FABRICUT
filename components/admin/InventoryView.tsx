"use client"
import {useEffect,useState} from 'react'
import {api} from '@/lib/client/api'
import {LOW_STOCK_THRESHOLD,type Product} from '@/lib/types'
import FabricThumb from './FabricThumb'
import ImageUpload from '../ImageUpload'

const emptyForm={name:'',stock:'',unit:'yd',imageUrl:'',active:true}

export default function InventoryView(){
  const [products,setProducts]=useState<Product[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [open,setOpen]=useState(false)
  const [editing,setEditing]=useState<Product|null>(null)
  const [form,setForm]=useState(emptyForm)
  const [busy,setBusy]=useState(false)

  async function refresh(){
    const list=await api<Product[]>('/products')
    setProducts(list)
  }

  useEffect(()=>{
    refresh().catch(e=>setError(e instanceof Error?e.message:'Inventory unavailable')).finally(()=>setLoading(false))
  },[])

  function startAdd(){
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }
  function startEdit(product:Product){
    setEditing(product)
    setForm({
      name:product.name,
      stock:String(product.stock),
      unit:product.unit||'yd',
      imageUrl:product.imageUrl||'',
      active:product.active,
    })
    setOpen(true)
  }

  async function save(e:React.FormEvent){
    e.preventDefault()
    setBusy(true);setError('')
    try{
      const payload={
        name:form.name,
        stock:Number(form.stock),
        unit:form.unit,
        imageUrl:form.imageUrl.trim(),
        active:form.active,
      }
      if(editing) await api(`/products/${encodeURIComponent(editing.id)}`,'PUT',payload)
      else await api('/products','POST',payload)
      setOpen(false)
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not save fabric')}
    finally{setBusy(false)}
  }

  async function toggle(product:Product){
    setError('')
    try{
      await api(`/products/${encodeURIComponent(product.id)}`,'PUT',{active:!product.active})
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not update fabric')}
  }

  async function remove(product:Product){
    if(!window.confirm(`Delete “${product.name}” from inventory? This cannot be undone.`)) return
    setError('')
    try{
      await api(`/products/${encodeURIComponent(product.id)}`,'DELETE')
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not delete fabric')}
  }

  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>Inventory</h1>
          <p>Fabrics available in the workshop (admin only). Customers buy from Products, which use these fabrics.</p>
        </div>
        <button type="button" className="atelier-btn atelier-btn-y" onClick={startAdd}>+ Add fabric</button>
      </div>
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {loading?<p role="status">Loading inventory…</p>:null}
      {!loading&&products.length===0?<p className="atelier-empty">No fabrics yet. Use + Add fabric to record what is available.</p>:null}
      {products.length>0?(
        <div className="atelier-table-wrap">
          <table className="atelier-table">
            <thead>
              <tr><th>Fabric</th><th>Stock</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {products.map(product=>(
                <tr key={product.id}>
                  <td><span className="atelier-cell"><FabricThumb product={product}/><strong>{product.name}</strong></span></td>
                  <td className={product.stock<=LOW_STOCK_THRESHOLD?'atelier-low':undefined}>{product.stock} {product.unit}{product.stock<=LOW_STOCK_THRESHOLD?' · low':''}</td>
                  <td>{product.active?'Active':'Hidden'}</td>
                  <td className="atelier-row-actions">
                    <button type="button" onClick={()=>startEdit(product)}>Edit</button>
                    <button type="button" onClick={()=>void toggle(product)}>{product.active?'Hide':'Show'}</button>
                    <button type="button" onClick={()=>void remove(product)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ):null}
      {open?(
        <div className="atelier-modal" role="dialog" aria-modal="true" aria-labelledby="inv-form-title">
          <form className="atelier-dialog" onSubmit={e=>void save(e)}>
            <h2 id="inv-form-title">{editing?'Edit fabric':'Add fabric'}</h2>
            <label>Fabric name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required maxLength={200}/></label>
            <div className="atelier-form-row">
              <label>Stock<input type="number" min="0" step="0.01" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})} required/></label>
              <label>Unit<input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} required maxLength={40}/></label>
            </div>
            <ImageUpload kind="inventory" label="Fabric photo" value={form.imageUrl} onChange={url=>setForm(f=>({...f,imageUrl:url}))}/>
            <label className="atelier-check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Active (available for products)</label>
            <div className="atelier-dialog-actions">
              <button type="button" className="atelier-btn atelier-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
              <button type="submit" className="atelier-btn atelier-btn-b" disabled={busy}>{busy?'Saving…':'Save fabric'}</button>
            </div>
          </form>
        </div>
      ):null}
    </>
  )
}
