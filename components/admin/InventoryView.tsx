"use client"
import {useEffect,useState} from 'react'
import {api} from '@/lib/client/api'
import {peso} from '@/lib/format'
import {LOW_STOCK_THRESHOLD,PRODUCT_CATEGORIES,type Product,type ProductCategory} from '@/lib/types'
import Swatch from './Swatch'
import ImageUpload from '../ImageUpload'

const emptyForm={name:'',category:'Fabrics' as ProductCategory,price:'',stock:'',unit:'yd',description:'',imageColor:'pina',imageUrl:'',active:true}

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
      category:product.category,
      price:String(product.price),
      stock:String(product.stock),
      unit:product.unit,
      description:product.description,
      imageColor:product.imageColor,
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
        category:form.category,
        price:Number(form.price),
        stock:Number(form.stock),
        unit:form.unit,
        description:form.description,
        imageColor:form.imageColor,
        imageUrl:form.imageUrl.trim(),
        active:form.active,
      }
      if(editing) await api(`/products/${encodeURIComponent(editing.id)}`,'PUT',payload)
      else await api('/products','POST',payload)
      setOpen(false)
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not save item')}
    finally{setBusy(false)}
  }

  async function toggle(product:Product){
    setError('')
    try{
      await api(`/products/${encodeURIComponent(product.id)}`,'PUT',{active:!product.active})
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not update item')}
  }

  async function remove(product:Product){
    if(!window.confirm(`Delete “${product.name}” from inventory? This cannot be undone.`)) return
    setError('')
    try{
      await api(`/products/${encodeURIComponent(product.id)}`,'DELETE')
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not delete item')}
  }

  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>Inventory</h1>
          <p>Raw fabrics and materials (admin only). Customers buy from Products, which use these items.</p>
        </div>
        <button type="button" className="atelier-btn atelier-btn-y" onClick={startAdd}>+ Add item</button>
      </div>
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {loading?<p role="status">Loading inventory…</p>:null}
      {!loading&&products.length===0?<p className="atelier-empty">No items yet. Use + Add item to record your fabrics and materials.</p>:null}
      {products.length>0?(
        <div className="atelier-table-wrap">
          <table className="atelier-table">
            <thead>
              <tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {products.map(product=>(
                <tr key={product.id}>
                  <td><span className="atelier-cell"><InventoryThumb product={product}/><strong>{product.name}</strong></span></td>
                  <td>{product.category}</td>
                  <td>{peso(product.price)}{product.unit==='yd'?' / yd':` / ${product.unit}`}</td>
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
            <h2 id="inv-form-title">{editing?'Edit item':'Add item'}</h2>
            <label>Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required maxLength={200}/></label>
            <label>Category
              <select value={form.category} onChange={e=>setForm({...form,category:e.target.value as ProductCategory})}>
                {PRODUCT_CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </label>
            <div className="atelier-form-row">
              <label>Price (₱)<input type="number" min="0.01" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} required/></label>
              <label>Stock<input type="number" min="0" step="0.01" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})} required/></label>
              <label>Unit<input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} required maxLength={40}/></label>
            </div>
            <label>Placeholder swatch
              <select value={form.imageColor} onChange={e=>setForm({...form,imageColor:e.target.value})}>
                {['pina','twill','patch','lace','lining','kit','swatch'].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <ImageUpload kind="inventory" label="Item photo" value={form.imageUrl} onChange={url=>setForm(f=>({...f,imageUrl:url}))}/>
            <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} maxLength={2000} rows={3}/></label>
            <label className="atelier-check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Active (available for products and walk-in orders)</label>
            <div className="atelier-dialog-actions">
              <button type="button" className="atelier-btn atelier-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
              <button type="submit" className="atelier-btn atelier-btn-b" disabled={busy}>{busy?'Saving…':'Save item'}</button>
            </div>
          </form>
        </div>
      ):null}
    </>
  )
}

/** Photo thumbnail when the item has one (falls back to the swatch if it fails to load). */
function InventoryThumb({product}:{product:Product}){
  const [failed,setFailed]=useState(false)
  if(!product.imageUrl||failed) return <Swatch tone={product.imageColor}/>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={product.imageUrl} alt="" className="inventory-thumb" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
}
