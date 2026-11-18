"use client"
import {useState} from 'react'
import type {Product} from '@/lib/types'
import Swatch from './Swatch'

/** Photo thumbnail for a fabric. Falls back to the leftover swatch (or a default) if the photo is missing or fails. */
export default function FabricThumb({product}:{product:Product}){
  const [failed,setFailed]=useState(false)
  if(!product.imageUrl||failed) return <Swatch tone={product.imageColor}/>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={product.imageUrl} alt="" className="inventory-thumb" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
}
