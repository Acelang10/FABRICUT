/**
 * Clothing types, their pattern/style variants, and sizes.
 * Edit this list to add a garment type or style; the admin form, customer picker,
 * pattern previews (components/GarmentPattern.tsx) and server validation all read from here.
 */
export interface ClothingStyle {id:string;label:string}
export interface ClothingType {id:string;label:string;styles:ClothingStyle[]}

export const CLOTHING_TYPES:ClothingType[]=[
  {id:'tshirt',label:'T-Shirt',styles:[{id:'crew',label:'Crew neck'},{id:'vneck',label:'V-neck'},{id:'scoop',label:'Scoop neck'}]},
  {id:'polo',label:'Polo Shirt',styles:[{id:'classic',label:'Classic'},{id:'slim',label:'Slim fit'},{id:'pocket',label:'With pocket'}]},
  {id:'longsleeve',label:'Long Sleeve',styles:[{id:'crew',label:'Crew neck'},{id:'vneck',label:'V-neck'},{id:'henley',label:'Henley'}]},
  {id:'hoodie',label:'Hoodie',styles:[{id:'pullover',label:'Pullover'},{id:'zip',label:'Zip-up'}]},
  {id:'dress',label:'Dress',styles:[{id:'aline',label:'A-line'},{id:'shift',label:'Shift'},{id:'wrap',label:'Wrap'}]},
  {id:'pants',label:'Pants',styles:[{id:'straight',label:'Straight leg'},{id:'slim',label:'Slim leg'},{id:'wide',label:'Wide leg'}]},
  {id:'shorts',label:'Shorts',styles:[{id:'classic',label:'Classic'},{id:'cargo',label:'Cargo'},{id:'athletic',label:'Athletic'}]},
  {id:'jacket',label:'Jacket',styles:[{id:'bomber',label:'Bomber'},{id:'denim',label:'Denim'},{id:'blazer',label:'Blazer'}]},
]

export const CLOTHING_SIZES=['XS','S','M','L','XL','XXL','XXXL'] as const
export type ClothingSize=typeof CLOTHING_SIZES[number]

export const DEFAULT_CLOTHING_TYPE='tshirt'
/** Used for products saved before clothing types existed. */
export const LEGACY_SIZES:string[]=['S','M','L','XL']

export function clothingType(id:string|undefined|null){
  return CLOTHING_TYPES.find(t=>t.id===id)||CLOTHING_TYPES.find(t=>t.id===DEFAULT_CLOTHING_TYPE)!
}
export function clothingLabel(id:string|undefined|null){return clothingType(id).label}
export function styleLabel(typeId:string|undefined|null,styleId:string|undefined|null){
  return clothingType(typeId).styles.find(s=>s.id===styleId)?.label||styleId||''
}

/** Returns an error message, or '' when type/styles/sizes form a valid combination. */
export function garmentError(typeId:string,styles:string[],sizes:string[]){
  const type=CLOTHING_TYPES.find(t=>t.id===typeId)
  if(!type) return 'Choose a clothing type'
  if(!styles.length) return 'Pick at least one pattern style'
  const bad=styles.find(s=>!type.styles.some(o=>o.id===s))
  if(bad) return `“${bad}” is not a ${type.label} pattern`
  if(new Set(styles).size!==styles.length) return 'Each pattern style can only be listed once'
  if(!sizes.length) return 'Pick at least one available size'
  const badSize=sizes.find(s=>!(CLOTHING_SIZES as readonly string[]).includes(s))
  if(badSize) return `Unknown size ${badSize}`
  if(new Set(sizes).size!==sizes.length) return 'Each size can only be listed once'
  return ''
}

/** Sort sizes in XS…XXXL order. */
export function sortSizes(sizes:string[]){
  return [...sizes].sort((a,b)=>CLOTHING_SIZES.indexOf(a as ClothingSize)-CLOTHING_SIZES.indexOf(b as ClothingSize))
}

export interface GarmentFields {clothingType:string;patternStyles:string[];sizes:string[]}
/** Fill garment fields for products created before clothing types existed. */
export function withGarmentDefaults<T extends Partial<GarmentFields>>(product:T):T&GarmentFields{
  const type=clothingType(product.clothingType)
  const styles=(product.patternStyles||[]).filter(s=>type.styles.some(o=>o.id===s))
  const sizes=sortSizes((product.sizes||[]).filter(s=>(CLOTHING_SIZES as readonly string[]).includes(s)))
  return {...product,clothingType:type.id,patternStyles:styles.length?styles:type.styles.map(s=>s.id),sizes:sizes.length?sizes:[...LEGACY_SIZES]}
}

/** Production pipeline for each order line (one garment line on an order). */
export const PRODUCTION_STAGES=['Queued','Cutting','Sewing','Finishing','Ready','Delivered'] as const
export type ProductionStage=typeof PRODUCTION_STAGES[number]

/** Admin may move a line one stage forward or one stage back. */
export function canMoveStage(from:ProductionStage,to:ProductionStage){
  const a=PRODUCTION_STAGES.indexOf(from),b=PRODUCTION_STAGES.indexOf(to)
  return a>=0&&b>=0&&Math.abs(a-b)===1
}
export function nextStage(stage:ProductionStage):ProductionStage|null{
  return PRODUCTION_STAGES[PRODUCTION_STAGES.indexOf(stage)+1]||null
}
export function previousStage(stage:ProductionStage):ProductionStage|null{
  const i=PRODUCTION_STAGES.indexOf(stage)
  return i>0?PRODUCTION_STAGES[i-1]:null
}
