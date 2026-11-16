"use client"
import {useEffect,useMemo,useState} from 'react'
import {api} from '@/lib/client/api'
import {addToCart,readCart,writeCart} from '@/lib/client/cart'
import {peso} from '@/lib/format'
import {clothingLabel,clothingType} from '@/lib/clothing'
import type {AppUser,ShopProduct} from '@/lib/types'
import ProductArt from './ProductArt'
import FabricList from './FabricList'
import GarmentPattern from '../GarmentPattern'

interface Choice {style:string;size:string}

export default function ProductsView(){
  const [products,setProducts]=useState<ShopProduct[]>([])
  const [user,setUser]=useState<AppUser|null>(null)
  const [query,setQuery]=useState('')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [notice,setNotice]=useState('')
  const [choices,setChoices]=useState<Record<string,Choice>>({})

  useEffect(()=>{
    Promise.all([api<ShopProduct[]>('/shop-products'),api<{user:AppUser}>('/auth/me')])
      .then(([list,session])=>{setProducts(list.filter(p=>p.status==='active'));setUser(session.user)})
      .catch(e=>setError(e instanceof Error?e.message:'Products unavailable'))
      .finally(()=>setLoading(false))
  },[])

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase()
    if(!q) return products
    return products.filter(p=>p.name.toLowerCase().includes(q)||clothingLabel(p.clothingType).toLowerCase().includes(q)||p.fabrics.some(f=>f.name.toLowerCase().includes(q)))
  },[products,query])

  const choiceFor=(p:ShopProduct):Choice=>choices[p.id]||{style:p.patternStyles[0],size:''}
  const setChoice=(p:ShopProduct,patch:Partial<Choice>)=>setChoices(c=>({...c,[p.id]:{...choiceFor(p),...patch}}))

  function add(product:ShopProduct){
    if(!user) return
    const choice=choiceFor(product)
    if(!choice.size){setNotice(`Choose a size for ${product.name}`);return}
    const lines=readCart(user.uid)
    const inCart=lines.filter(l=>l.productId===product.id).reduce((n,l)=>n+l.qty,0)
    if(inCart+1>product.stock){setNotice(`Only ${product.stock} of ${product.name} available`);return}
    writeCart(user.uid,addToCart(lines,{productId:product.id,kind:'product',name:product.name,price:product.price,imageUrl:product.imageUrl,clothingType:product.clothingType,size:choice.size,style:choice.style}))
    window.dispatchEvent(new Event('fabricut-cart'))
    setNotice(`${product.name} (size ${choice.size}) added to cart`)
  }

  return (
    <>
      <div className="atelier-shop-head">
        <h1>Products</h1>
        <input className="atelier-search" type="search" placeholder="Search products, clothes, or fabrics" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search products"/>
      </div>
      {loading?<p role="status">Loading products…</p>:null}
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
      {notice?<p className="atelier-success" role="status">{notice}</p>:null}
      {!loading&&visible.length===0?<p className="atelier-empty">{query?'No products match your search.':'No products for sale yet. Check back soon.'}</p>:null}
      <div className="atelier-grid">
        {visible.map(product=>{
          const choice=choiceFor(product)
          const type=clothingType(product.clothingType)
          return (
            <article key={product.id} className="atelier-card">
              {product.imageUrl?<ProductArt imageUrl={product.imageUrl} name={product.name}/>:null}
              <GarmentPattern type={product.clothingType} style={choice.style} size={product.imageUrl?'md':'lg'}/>
              <div className="atelier-meta">
                <div className="atelier-cat">{type.label}</div>
                <h2>{product.name}</h2>
                <p className="atelier-price">{peso(product.price)}</p>
                <p className="atelier-muted">{product.stock>0?`${product.stock} available`:'Sold out'}</p>
                {product.description?<p className="atelier-muted atelier-desc">{product.description}</p>:null}

                <div className="pick" role="radiogroup" aria-label={`Pattern for ${product.name}`}>
                  <span className="pick-label">Pattern</span>
                  <div className="garment-tiles">
                    {product.patternStyles.map(id=>{
                      const label=type.styles.find(s=>s.id===id)?.label||id
                      return (
                        <button key={id} type="button" role="radio" aria-checked={choice.style===id} className={`garment-tile ${choice.style===id?'on':''}`} onClick={()=>setChoice(product,{style:id})}>
                          <GarmentPattern type={product.clothingType} style={id} size="sm"/>
                          <span>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="pick" role="radiogroup" aria-label={`Size for ${product.name}`}>
                  <span className="pick-label">Size</span>
                  <div className="size-picks">
                    {product.sizes.map(size=>(
                      <button key={size} type="button" role="radio" aria-checked={choice.size===size} className={`size-pick ${choice.size===size?'on':''}`} onClick={()=>setChoice(product,{size})}>{size}</button>
                    ))}
                  </div>
                </div>

                <FabricList fabrics={product.fabrics} label="Made with"/>
                <button type="button" className="atelier-btn atelier-btn-y atelier-btn-block" disabled={product.stock<=0} onClick={()=>add(product)}>
                  {product.stock<=0?'Sold out':choice.size?`Add size ${choice.size} to cart`:'Choose a size'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}
