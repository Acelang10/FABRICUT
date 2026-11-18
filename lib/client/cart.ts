/** Cart lines always reference sellable products (shop-products), never raw inventory. */
export interface CartLine {productId:string;kind:'product';name:string;price:number;imageUrl:string;qty:number;clothingType?:string;size?:string;style?:string;color?:string;fabricId?:string;fabricName?:string}

/** Same product in a different size, pattern, color or fabric is its own cart line. */
export function lineKey(line:Pick<CartLine,'productId'|'size'|'style'|'color'|'fabricId'>){return `${line.productId}|${line.size||''}|${line.style||''}|${line.color||''}|${line.fabricId||''}`}

/** Add one unit of a product/size/pattern to the cart lines. */
export function addToCart(lines:CartLine[],line:Omit<CartLine,'qty'>,qty=1):CartLine[]{
  const key=lineKey(line)
  return lines.some(l=>lineKey(l)===key)
    ? lines.map(l=>lineKey(l)===key?{...l,qty:l.qty+qty,price:line.price}:l)
    : [...lines,{...line,qty}]
}

const keyFor=(uid:string)=>`fabricut-cart:${uid||'guest'}`

export function readCart(uid:string):CartLine[]{
  if(typeof window==='undefined') return []
  try{
    const raw=window.localStorage.getItem(keyFor(uid))
    const parsed=raw?JSON.parse(raw) as CartLine[]:[]
    // Older carts held inventory items, which are no longer sold directly; drop them.
    return Array.isArray(parsed)?parsed.filter(line=>line&&line.kind==='product'&&line.productId&&line.qty>0):[]
  }catch{return []}
}

export function writeCart(uid:string,lines:CartLine[]){
  window.localStorage.setItem(keyFor(uid),JSON.stringify(lines))
}

export function cartCount(lines:CartLine[]){return lines.reduce((n,line)=>n+line.qty,0)}
export function cartTotal(lines:CartLine[]){return lines.reduce((n,line)=>n+line.price*line.qty,0)}
