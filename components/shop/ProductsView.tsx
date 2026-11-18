"use client"
import {useEffect,useMemo,useState} from 'react'
import {api} from '@/lib/client/api'
import {addToCart,readCart,writeCart} from '@/lib/client/cart'
import {peso} from '@/lib/format'
import {lineChoiceLabel,shortDescription} from '@/lib/fabrics'
import {clothingLabel,clothingType,styleLabel} from '@/lib/clothing'
import type {AppUser,ShopFabric,ShopProduct} from '@/lib/types'
import GarmentPattern from '../GarmentPattern'
import Modal from '../Modal'
import ProductMedia from '../ProductMedia'

interface Choice {style:string;size:string;color:string;fabricId:string;qty:string}

const emptyChoice=(product:ShopProduct):Choice=>({
  style:product.patternStyles[0]||'',
  size:'',
  color:'',
  fabricId:'',
  qty:'1',
})

export default function ProductsView(){
  const [products,setProducts]=useState<ShopProduct[]>([])
  const [fabrics,setFabrics]=useState<ShopFabric[]>([])
  const [user,setUser]=useState<AppUser|null>(null)
  const [query,setQuery]=useState('')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [notice,setNotice]=useState('')
  const [selected,setSelected]=useState<ShopProduct|null>(null)
  const [choice,setChoice]=useState<Choice>({style:'',size:'',color:'',fabricId:'',qty:'1'})

  useEffect(()=>{
    Promise.all([api<ShopProduct[]>('/shop-products'),api<ShopFabric[]>('/fabrics'),api<{user:AppUser}>('/auth/me')])
      .then(([list,stock,session])=>{
        setProducts(list.filter(p=>p.status==='active'))
        setFabrics(stock)
        setUser(session.user)
      })
      .catch(e=>setError(e instanceof Error?e.message:'Products unavailable'))
      .finally(()=>setLoading(false))
  },[])

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase()
    if(!q) return products
    return products.filter(p=>
      p.name.toLowerCase().includes(q)
      ||p.description.toLowerCase().includes(q)
      ||clothingLabel(p.clothingType).toLowerCase().includes(q)
      ||(p.colors||[]).some(c=>c.name.toLowerCase().includes(q))
    )
  },[products,query])

  function open(product:ShopProduct){
    setNotice('')
    setSelected(product)
    setChoice(emptyChoice(product))
  }

  function patch(update:Partial<Choice>){
    setChoice(current=>({...current,...update}))
  }

  function add(product:ShopProduct){
    if(!user) return
    const qty=Number(choice.qty)
    if(!Number.isInteger(qty)||qty<1){setNotice('Enter a quantity of at least 1');return}
    if(!choice.size){setNotice(`Choose a size for ${product.name}`);return}
    if(!choice.style){setNotice(`Choose a pattern for ${product.name}`);return}
    if((product.colors||[]).length&&!choice.color){setNotice(`Choose a color for ${product.name}`);return}
    if(!choice.fabricId){setNotice('Choose a fabric');return}
    const fabric=fabrics.find(f=>f.id===choice.fabricId)
    if(!fabric){setNotice('Choose a fabric that is in stock');return}
    const lines=readCart(user.uid)
    const inCart=lines.filter(l=>l.productId===product.id).reduce((n,l)=>n+l.qty,0)
    if(inCart+qty>product.stock){setNotice(`Only ${product.stock} of ${product.name} available`);return}
    writeCart(user.uid,addToCart(lines,{
      productId:product.id,
      kind:'product',
      name:product.name,
      price:product.price,
      imageUrl:product.imageUrl,
      clothingType:product.clothingType,
      size:choice.size,
      style:choice.style,
      color:choice.color||undefined,
      fabricId:fabric.id,
      fabricName:fabric.name,
    },qty))
    window.dispatchEvent(new Event('fabricut-cart'))
    setSelected(null)
    const summary=lineChoiceLabel({chosenFabric:{inventoryItemId:fabric.id,name:fabric.name,unit:fabric.unit},color:choice.color,clothingType:product.clothingType,style:choice.style,size:choice.size},styleLabel(product.clothingType,choice.style))
    setNotice(`${product.name} (${summary}) added to cart`)
  }

  return (
    <>
      <div className="atelier-shop-head">
        <h1>Products</h1>
        <input className="atelier-search" type="search" placeholder="Search products, clothes, or colors" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search products"/>
      </div>
      {loading?<p role="status">Loading products…</p>:null}
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {notice?<p className="atelier-success" role="status">{notice}</p>:null}
      {!loading&&visible.length===0?<p className="atelier-empty">{query?'No products match your search.':'No products for sale yet. Check back soon.'}</p>:null}
      <div className="atelier-grid">
        {visible.map(product=>{
          const blurb=shortDescription(product.description)
          return (
            <article key={product.id} className="atelier-card atelier-card-clickable" onClick={()=>{if(product.stock>0) open(product)}}>
              <div onClick={e=>{if((e.target as HTMLElement).closest('.media-toggle')) e.stopPropagation()}}>
                <ProductMedia imageUrl={product.imageUrl} name={product.name} clothingType={product.clothingType} style={product.patternStyles[0]}/>
              </div>
              <div className="atelier-meta">
                <div className="atelier-cat">{clothingType(product.clothingType).label}</div>
                <h2>{product.name}</h2>
                <p className="atelier-price">{peso(product.price)}</p>
                <p className="atelier-muted">{product.stock>0?`${product.stock} available`:'Sold out'}</p>
                {blurb?<p className="atelier-muted atelier-desc">{blurb}</p>:null}
                <button type="button" className="atelier-btn atelier-btn-y atelier-btn-block" disabled={product.stock<=0} onClick={e=>{e.stopPropagation();open(product)}}>
                  {product.stock<=0?'Sold out':'Choose'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      {selected?(
        <OrderModal
          product={selected}
          fabrics={fabrics}
          choice={choice}
          onChange={patch}
          onClose={()=>setSelected(null)}
          onAdd={()=>add(selected)}
        />
      ):null}
    </>
  )
}

function OrderModal({product,fabrics,choice,onChange,onClose,onAdd}:{
  product:ShopProduct
  fabrics:ShopFabric[]
  choice:Choice
  onChange:(patch:Partial<Choice>)=>void
  onClose:()=>void
  onAdd:()=>void
}){
  const type=clothingType(product.clothingType)
  const colors=product.colors||[]
  return (
    <Modal title={product.name} close={onClose} wide>
      <form className="order-modal" onSubmit={e=>{e.preventDefault();onAdd()}}>
        <ProductMedia imageUrl={product.imageUrl} name={product.name} clothingType={product.clothingType} style={choice.style||product.patternStyles[0]}/>
        <p className="atelier-price">{peso(product.price)}</p>
        <p className="atelier-muted">{product.stock>0?`${product.stock} available`:'Sold out'}</p>
        {product.description?<p className="order-modal-desc">{product.description}</p>:null}

        <fieldset className="atelier-fabric-rows">
          <legend>Fabric</legend>
          <div className="fabric-picks" role="radiogroup" aria-label={`Fabric for ${product.name}`}>
            {fabrics.map(item=>(
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={choice.fabricId===item.id}
                className={`fabric-pick ${choice.fabricId===item.id?'on':''}`}
                onClick={()=>onChange({fabricId:item.id})}
              >
                {item.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ?<img src={item.imageUrl} alt="" className="fabric-thumb" referrerPolicy="no-referrer"/>
                  :<span className="fabric-thumb fabric-thumb-empty" aria-hidden="true"/>}
                <span>
                  <b>{item.name}</b>
                  <small>{item.stock} {item.unit} left</small>
                </span>
              </button>
            ))}
          </div>
          {!fabrics.length?<p className="atelier-muted">No fabrics are in stock right now. Please check back soon.</p>:null}
        </fieldset>

        {colors.length?(
          <fieldset className="atelier-fabric-rows">
            <legend>Color</legend>
            <div className="color-picks" role="radiogroup" aria-label={`Color for ${product.name}`}>
              {colors.map(color=>(
                <button
                  key={color.name}
                  type="button"
                  role="radio"
                  aria-checked={choice.color===color.name}
                  className={`color-pick ${choice.color===color.name?'on':''}`}
                  onClick={()=>onChange({color:color.name})}
                >
                  <span className="color-dot" style={{background:color.hex||'#d6deee'}} aria-hidden="true"/>
                  {color.name}
                </button>
              ))}
            </div>
          </fieldset>
        ):null}

        <fieldset className="atelier-fabric-rows">
          <legend>Pattern</legend>
          <div className="garment-tiles" role="radiogroup" aria-label={`Pattern for ${product.name}`}>
            {product.patternStyles.map(id=>{
              const label=type.styles.find(s=>s.id===id)?.label||id
              return (
                <button key={id} type="button" role="radio" aria-checked={choice.style===id} className={`garment-tile ${choice.style===id?'on':''}`} onClick={()=>onChange({style:id})}>
                  <GarmentPattern type={product.clothingType} style={id} size="sm"/>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="atelier-fabric-rows">
          <legend>Size</legend>
          <div className="size-picks" role="radiogroup" aria-label={`Size for ${product.name}`}>
            {product.sizes.map(size=>(
              <button key={size} type="button" role="radio" aria-checked={choice.size===size} className={`size-pick ${choice.size===size?'on':''}`} onClick={()=>onChange({size})}>{size}</button>
            ))}
          </div>
        </fieldset>

        <label>Quantity
          <input type="number" min={1} max={product.stock} step={1} value={choice.qty} onChange={e=>onChange({qty:e.target.value})} required/>
        </label>

        <div className="atelier-dialog-actions">
          <button type="button" className="atelier-btn atelier-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="atelier-btn atelier-btn-y" disabled={product.stock<=0||!fabrics.length}>
            {product.stock<=0?'Sold out':'Add to cart'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
