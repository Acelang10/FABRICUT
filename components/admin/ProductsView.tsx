"use client"
import {useEffect,useMemo,useState} from 'react'
import {api} from '@/lib/client/api'
import {peso} from '@/lib/format'
import {availableFabricOptions,fabricOptionLabel} from '@/lib/fabrics'
import type {Product,ShopProduct,ShopProductStatus} from '@/lib/types'
import ProductArt from '../shop/ProductArt'
import FabricList from '../shop/FabricList'
import GarmentPattern from '../GarmentPattern'
import {CLOTHING_SIZES,CLOTHING_TYPES,clothingLabel,clothingType,garmentError,sortSizes,styleLabel} from '@/lib/clothing'

interface FabricRow {inventoryItemId:string;quantity:string}
interface FormState {clothingType:string;patternStyles:string[];sizes:string[];name:string;description:string;price:string;stock:string;imageUrl:string;status:ShopProductStatus;fabrics:FabricRow[]}

const emptyForm=():FormState=>({clothingType:'',patternStyles:[],sizes:[],name:'',description:'',price:'',stock:'',imageUrl:'',status:'active',fabrics:[{inventoryItemId:'',quantity:'1'}]})

export default function AdminProductsView(){
  const [products,setProducts]=useState<ShopProduct[]>([])
  const [inventory,setInventory]=useState<Product[]>([])
  const [error,setError]=useState('')
  const [formError,setFormError]=useState('')
  const [loading,setLoading]=useState(true)
  const [open,setOpen]=useState(false)
  const [editing,setEditing]=useState<ShopProduct|null>(null)
  const [form,setForm]=useState<FormState>(emptyForm)
  const [busy,setBusy]=useState(false)

  async function refresh(){
    const [list,stock]=await Promise.all([api<ShopProduct[]>('/shop-products'),api<Product[]>('/products')])
    setProducts(list)
    setInventory(stock)
  }

  useEffect(()=>{
    refresh().catch(e=>setError(e instanceof Error?e.message:'Products unavailable')).finally(()=>setLoading(false))
  },[])

  // Dropdown: in-stock inventory only, plus fabrics already on the product being edited.
  const options=useMemo(()=>availableFabricOptions(inventory,editing?.fabrics.map(f=>f.inventoryItemId)||[]),[inventory,editing])
  const unitOf=(id:string)=>inventory.find(i=>i.id===id)?.unit||''

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
      status:product.status,
      fabrics:product.fabrics.length?product.fabrics.map(f=>({inventoryItemId:f.inventoryItemId,quantity:String(f.quantity)})):[{inventoryItemId:'',quantity:'1'}],
    })
    setFormError('');setOpen(true)
  }

  function setRow(index:number,patch:Partial<FabricRow>){
    setForm(f=>({...f,fabrics:f.fabrics.map((row,i)=>i===index?{...row,...patch}:row)}))
  }
  function chooseType(id:string){
    // Picking a type first: offer all of its pattern styles by default; admin can untick.
    setForm(f=>({...f,clothingType:id,patternStyles:id?clothingType(id).styles.map(s=>s.id):[],sizes:f.sizes.length?f.sizes:['S','M','L','XL']}))
  }
  function toggleStyle(id:string){
    setForm(f=>({...f,patternStyles:f.patternStyles.includes(id)?f.patternStyles.filter(s=>s!==id):[...f.patternStyles,id]}))
  }
  function toggleSize(size:string){
    setForm(f=>({...f,sizes:f.sizes.includes(size)?f.sizes.filter(s=>s!==size):sortSizes([...f.sizes,size])}))
  }
  function addRow(){setForm(f=>({...f,fabrics:[...f.fabrics,{inventoryItemId:'',quantity:'1'}]}))}
  function removeRow(index:number){setForm(f=>({...f,fabrics:f.fabrics.filter((_,i)=>i!==index)}))}

  async function save(e:React.FormEvent){
    e.preventDefault()
    setBusy(true);setFormError('')
    try{
      const fabrics=form.fabrics.filter(r=>r.inventoryItemId).map(r=>({inventoryItemId:r.inventoryItemId,quantity:Number(r.quantity)}))
      const garment=garmentError(form.clothingType,form.patternStyles,form.sizes)
      if(garment) throw new Error(garment)
      const ids=fabrics.map(f=>f.inventoryItemId)
      if(new Set(ids).size!==ids.length) throw new Error('Each fabric can only be listed once')
      const payload={
        name:form.name,
        description:form.description,
        price:Number(form.price),
        stock:Number(form.stock),
        imageUrl:form.imageUrl.trim(),
        status:form.status,
        fabrics,
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
          <p>Finished items customers can buy. Each one lists the inventory fabrics it uses.</p>
        </div>
        <button type="button" className="atelier-btn atelier-btn-y" onClick={startAdd}>+ Add product</button>
      </div>
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {loading?<p role="status">Loading products…</p>:null}
      {!loading&&products.length===0?<p className="atelier-empty">No products yet. Use + Add product, pick the fabrics from inventory, and set it Active to show it in the shop.</p>:null}
      <div className="atelier-grid">
        {products.map(product=>(
          <article key={product.id} className="atelier-card">
            {product.imageUrl?<ProductArt imageUrl={product.imageUrl} name={product.name}/>:<GarmentPattern type={product.clothingType} style={product.patternStyles[0]}/>}
            <div className="atelier-meta">
              <div className="atelier-cat">{clothingLabel(product.clothingType)}</div>
              <div className="atelier-card-top">
                <span className={`atelier-tag ${product.status==='active'?'live':'draft'}`}>{product.status==='active'?'Active · in shop':'Draft · hidden'}</span>
              </div>
              <h2>{product.name}</h2>
              <p className="atelier-price">{peso(product.price)}</p>
              <p className={product.stock<=0?'atelier-muted atelier-low':'atelier-muted'}>{product.stock} available</p>
              {product.description?<p className="atelier-muted atelier-desc">{product.description}</p>:null}
              <p className="atelier-muted"><b>Patterns:</b> {product.patternStyles.map(s=>styleLabel(product.clothingType,s)).join(', ')}</p>
              <p className="atelier-muted"><b>Sizes:</b> {product.sizes.join(' · ')}</p>
              <FabricList fabrics={product.fabrics}/>
              {!product.fabrics.length?<p className="atelier-muted">No fabrics listed</p>:null}
              <div className="atelier-row-actions atelier-card-actions">
                <button type="button" onClick={()=>startEdit(product)}>Edit</button>
                <button type="button" onClick={()=>void toggle(product)}>{product.status==='active'?'Hide':'Publish'}</button>
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
            <div className="atelier-form-row">
              <label>Price (₱)<input type="number" min="0.01" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} required/></label>
              <label>Available to sell<input type="number" min="0" step="1" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})} required/></label>
              <label>Status
                <select value={form.status} onChange={e=>setForm({...form,status:e.target.value as ShopProductStatus})}>
                  <option value="active">Active (in shop)</option>
                  <option value="draft">Draft (hidden)</option>
                </select>
              </label>
            </div>
            <label>Image link (optional)<input value={form.imageUrl} onChange={e=>setForm({...form,imageUrl:e.target.value})} placeholder="https://… or /logo.jpg" maxLength={500}/></label>
            <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} maxLength={2000} rows={3}/></label>

            <fieldset className="atelier-fabric-rows">
              <legend>Fabrics used (per item sold)</legend>
              {options.length===0?<p className="atelier-muted">No inventory with stock left. Add stock in Inventory first.</p>:null}
              {form.fabrics.map((row,index)=>(
                <div className="atelier-fabric-row" key={index}>
                  <label>Fabric
                    <select value={row.inventoryItemId} onChange={e=>setRow(index,{inventoryItemId:e.target.value})}>
                      <option value="">Select from inventory</option>
                      {options.map(item=>(
                        <option key={item.id} value={item.id} disabled={item.id!==row.inventoryItemId&&form.fabrics.some(r=>r.inventoryItemId===item.id)}>
                          {fabricOptionLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>Qty used{row.inventoryItemId?` (${unitOf(row.inventoryItemId)})`:''}
                    <input type="number" min="0.01" step="0.01" value={row.quantity} onChange={e=>setRow(index,{quantity:e.target.value})} required={Boolean(row.inventoryItemId)}/>
                  </label>
                  <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" onClick={()=>removeRow(index)} aria-label={`Remove fabric row ${index+1}`}>Remove</button>
                </div>
              ))}
              <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" onClick={addRow}>+ Add fabric</button>
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
