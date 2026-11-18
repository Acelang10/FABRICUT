"use client"
import {useEffect,useState} from 'react'
import {api} from '@/lib/client/api'
import {peso} from '@/lib/format'
import type {ProductColor,ShopProduct} from '@/lib/types'
import ProductMedia from '../ProductMedia'
import ImageUpload from '../ImageUpload'
import GarmentPattern from '../GarmentPattern'
import {CLOTHING_SIZES,CLOTHING_TYPES,clothingLabel,clothingType,garmentError,sortSizes,styleLabel} from '@/lib/clothing'

interface FormState {
  clothingType:string
  patternStyles:string[]
  sizes:string[]
  name:string
  description:string
  price:string
  stock:string
  imageUrl:string
  colors:ProductColor[]
}

const emptyForm=():FormState=>({clothingType:'',patternStyles:[],sizes:[],name:'',description:'',price:'',stock:'',imageUrl:'',colors:[]})

export default function AdminProductsView(){
  const [products,setProducts]=useState<ShopProduct[]>([])
  const [error,setError]=useState('')
  const [formError,setFormError]=useState('')
  const [loading,setLoading]=useState(true)
  const [open,setOpen]=useState(false)
  const [editing,setEditing]=useState<ShopProduct|null>(null)
  const [form,setForm]=useState<FormState>(emptyForm)
  const [busy,setBusy]=useState(false)

  async function refresh(){
    setProducts(await api<ShopProduct[]>('/shop-products'))
  }

  useEffect(()=>{
    refresh().catch(e=>setError(e instanceof Error?e.message:'Products unavailable')).finally(()=>setLoading(false))
  },[])

  function startAdd(){
    setEditing(null);setForm(emptyForm());setFormError('');setOpen(true)
  }
  function startEdit(product:ShopProduct){
    setEditing(product)
    setForm({
      clothingType:product.clothingType,
      patternStyles:[...product.patternStyles],
      sizes:[...product.sizes],
      name:product.name,
      description:product.description,
      price:String(product.price),
      stock:String(product.stock),
      imageUrl:product.imageUrl,
      colors:product.colors?.length?product.colors.map(c=>({...c})):[]
    })
    setFormError('');setOpen(true)
  }

  function chooseType(id:string){
    setForm(f=>({...f,clothingType:id,patternStyles:id?clothingType(id).styles.map(s=>s.id):[],sizes:f.sizes.length?f.sizes:['S','M','L','XL']}))
  }
  function toggleStyle(id:string){
    setForm(f=>({...f,patternStyles:f.patternStyles.includes(id)?f.patternStyles.filter(s=>s!==id):[...f.patternStyles,id]}))
  }
  function toggleSize(size:string){
    setForm(f=>({...f,sizes:f.sizes.includes(size)?f.sizes.filter(s=>s!==size):sortSizes([...f.sizes,size])}))
  }
  function setColor(index:number,patch:Partial<ProductColor>){
    setForm(f=>({...f,colors:f.colors.map((row,i)=>i===index?{...row,...patch}:row)}))
  }
  function addColor(){
    setForm(f=>({...f,colors:[...f.colors,{name:'',hex:'#1f3a5f'}]}))
  }
  function removeColor(index:number){
    setForm(f=>({...f,colors:f.colors.filter((_,i)=>i!==index)}))
  }

  async function save(e:React.FormEvent){
    e.preventDefault()
    setBusy(true);setFormError('')
    try{
      const garment=garmentError(form.clothingType,form.patternStyles,form.sizes)
      if(garment) throw new Error(garment)
      const colors=form.colors
        .map(c=>({name:c.name.trim(),...(c.hex?{hex:c.hex}:{})}))
        .filter(c=>c.name)
      const names=colors.map(c=>c.name.toLowerCase())
      if(new Set(names).size!==names.length) throw new Error('Each color can only be listed once')
      const payload={
        name:form.name,
        description:form.description,
        price:Number(form.price),
        stock:Number(form.stock),
        imageUrl:form.imageUrl.trim(),
        colors,
        clothingType:form.clothingType,
        patternStyles:form.patternStyles,
        sizes:form.sizes,
      }
      if(editing) await api(`/shop-products/${encodeURIComponent(editing.id)}`,'PUT',payload)
      else await api('/shop-products','POST',payload)
      setOpen(false)
      await refresh()
    }catch(err){setFormError(err instanceof Error?err.message:'Could not save product')}
    finally{setBusy(false)}
  }

  async function toggle(product:ShopProduct){
    setError('')
    try{
      await api(`/shop-products/${encodeURIComponent(product.id)}`,'PUT',{status:product.status==='active'?'draft':'active'})
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not update product')}
  }

  async function remove(product:ShopProduct){
    if(!window.confirm(`Delete “${product.name}”? Customers will no longer see it. This cannot be undone.`)) return
    setError('')
    try{
      await api(`/shop-products/${encodeURIComponent(product.id)}`,'DELETE')
      await refresh()
    }catch(err){setError(err instanceof Error?err.message:'Could not delete product')}
  }

  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>Products</h1>
          <p>Finished items customers can buy. They pick the fabric, color, pattern and size when they order.</p>
        </div>
        <button type="button" className="atelier-btn atelier-btn-y" onClick={startAdd}>+ Add product</button>
      </div>
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {loading?<p role="status">Loading products…</p>:null}
      {!loading&&products.length===0?<p className="atelier-empty">No products yet. Use + Add product to create one. New products show in the shop right away.</p>:null}
      <div className="atelier-grid">
        {products.map(product=>(
          <article key={product.id} className="atelier-card">
            <ProductMedia imageUrl={product.imageUrl} name={product.name} clothingType={product.clothingType} style={product.patternStyles[0]}/>
            <div className="atelier-meta">
              <div className="atelier-cat">{clothingLabel(product.clothingType)}</div>
              {product.status!=='active'?<div className="atelier-card-top"><span className="atelier-tag draft">Hidden from shop</span></div>:null}
              <h2>{product.name}</h2>
              <p className="atelier-price">{peso(product.price)}</p>
              <p className={product.stock<=0?'atelier-muted atelier-low':'atelier-muted'}>{product.stock} available</p>
              {product.description?<p className="atelier-muted atelier-desc">{product.description}</p>:null}
              <p className="atelier-muted"><b>Patterns:</b> {product.patternStyles.map(s=>styleLabel(product.clothingType,s)).join(', ')}</p>
              <p className="atelier-muted"><b>Sizes:</b> {product.sizes.join(' · ')}</p>
              {product.colors?.length?<p className="atelier-muted"><b>Colors:</b> {product.colors.map(c=>c.name).join(', ')}</p>:null}
              <div className="atelier-row-actions atelier-card-actions">
                <button type="button" onClick={()=>startEdit(product)}>Edit</button>
                <button type="button" onClick={()=>void toggle(product)}>{product.status==='active'?'Hide':'Show in shop'}</button>
                <button type="button" onClick={()=>void remove(product)}>Delete</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {open?(
        <div className="atelier-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
          <form className="atelier-dialog" onSubmit={e=>void save(e)}>
            <h2 id="product-form-title">{editing?'Edit product':'Add product'}</h2>
            <label>Type of clothes
              <select value={form.clothingType} onChange={e=>chooseType(e.target.value)} required autoFocus={!editing}>
                <option value="">Select a clothing type first</option>
                {CLOTHING_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            {form.clothingType?<>
            <GarmentPattern type={form.clothingType} style={form.patternStyles[0]||clothingType(form.clothingType).styles[0].id} size="lg"/>
            <fieldset className="atelier-fabric-rows">
              <legend>Patterns customers can choose</legend>
              <div className="garment-tiles">
                {clothingType(form.clothingType).styles.map(s=>(
                  <label key={s.id} className={`garment-tile ${form.patternStyles.includes(s.id)?'on':''}`}>
                    <input type="checkbox" checked={form.patternStyles.includes(s.id)} onChange={()=>toggleStyle(s.id)}/>
                    <GarmentPattern type={form.clothingType} style={s.id} size="sm"/>
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="atelier-fabric-rows">
              <legend>Available sizes</legend>
              <div className="size-picks">
                {CLOTHING_SIZES.map(size=>(
                  <label key={size} className={`size-pick ${form.sizes.includes(size)?'on':''}`}>
                    <input type="checkbox" checked={form.sizes.includes(size)} onChange={()=>toggleSize(size)}/>{size}
                  </label>
                ))}
              </div>
            </fieldset>
            </>:<p className="atelier-muted">Choose the type of clothes to see its pattern, styles, and sizes.</p>}
            <label>Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required maxLength={200}/></label>
            <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} maxLength={2000} rows={4} placeholder="Tell customers about this item"/></label>
            <div className="atelier-form-row">
              <label>Price (₱)<input type="number" min="0.01" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} required/></label>
              <label>Available to sell<input type="number" min="0" step="1" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})} required/></label>
            </div>
            <ImageUpload kind="products" label="Product photo" value={form.imageUrl} onChange={url=>setForm(f=>({...f,imageUrl:url}))}/>

            <fieldset className="atelier-fabric-rows">
              <legend>Available colors</legend>
              <p className="atelier-muted">Optional. If you add none, customers skip the color step.</p>
              {form.colors.map((row,index)=>(
                <div className="atelier-color-row" key={index}>
                  <label>Color name
                    <input value={row.name} onChange={e=>setColor(index,{name:e.target.value})} maxLength={40} placeholder="e.g. Navy"/>
                  </label>
                  <label className="atelier-color-swatch">Swatch
                    <input type="color" value={row.hex||'#1f3a5f'} onChange={e=>setColor(index,{hex:e.target.value})} aria-label={`Color swatch for ${row.name||`color ${index+1}`}`}/>
                  </label>
                  <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" onClick={()=>removeColor(index)} aria-label={`Remove color ${row.name||index+1}`}>Remove</button>
                </div>
              ))}
              <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" onClick={addColor}>+ Add color</button>
            </fieldset>

            {formError?<p className="atelier-error" role="alert">{formError}</p>:null}
            <div className="atelier-dialog-actions">
              <button type="button" className="atelier-btn atelier-btn-ghost" onClick={()=>setOpen(false)}>Cancel</button>
              <button type="submit" className="atelier-btn atelier-btn-b" disabled={busy}>{busy?'Saving…':'Save product'}</button>
            </div>
          </form>
        </div>
      ):null}
    </>
  )
}
