import Swatch from '../admin/Swatch'

/** Product photo when an image link is set, otherwise the yellow/navy placeholder swatch. */
export default function ProductArt({imageUrl,name}:{imageUrl:string;name:string}){
  if(!imageUrl) return <Swatch tone="kit" className="atelier-art"/>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={imageUrl} alt={name} className="atelier-art atelier-photo" loading="lazy" referrerPolicy="no-referrer"/>
}
