"use client"
import {useEffect,useRef,useState} from 'react'
import {canToggleMedia,resolveMediaView,type MediaView} from '@/lib/media'
import ProductArt from './shop/ProductArt'
import GarmentPattern from './GarmentPattern'

/** Product card media: photo by default, with a Photo / Pattern toggle. No photo = pattern only, no toggle. */
export default function ProductMedia({imageUrl,name,clothingType,style}:{imageUrl:string;name:string;clothingType:string;style:string}){
  const [requested,setRequested]=useState<MediaView|undefined>(undefined)
  const [failed,setFailed]=useState(false)
  const photo=failed?'':imageUrl
  // Picking a different pattern tile shows that pattern (the photo stays one click away).
  const lastStyle=useRef(style)
  useEffect(()=>{ if(lastStyle.current!==style){ lastStyle.current=style; setRequested('pattern') } },[style])
  const view=resolveMediaView(photo,requested)
  return (
    <div className="product-media">
      {view==='photo'
        ?<ProductArt imageUrl={photo} name={name} onError={()=>setFailed(true)}/>
        :<GarmentPattern type={clothingType} style={style} size="lg"/>}
      {canToggleMedia(photo)?(
        <div className="media-toggle" role="group" aria-label={`Show photo or pattern for ${name}`}>
          <button type="button" aria-pressed={view==='photo'} className={view==='photo'?'on':undefined} onClick={()=>setRequested('photo')}>Photo</button>
          <button type="button" aria-pressed={view==='pattern'} className={view==='pattern'?'on':undefined} onClick={()=>setRequested('pattern')}>Pattern</button>
        </div>
      ):null}
    </div>
  )
}
