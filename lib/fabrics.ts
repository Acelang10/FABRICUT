import type {FabricUse,OrderItem,Product} from './types'

export function round2(value:number){
  return Math.round(value*100)/100
}

export function lineKind(item:Pick<OrderItem,'kind'>){
  return item.kind==='product'?'product':'inventory'
}

/**
 * Inventory items an admin may pick in a product's fabric dropdown:
 * only items with remaining stock, plus any already chosen on the product being edited
 * (so an existing row never loses its selection when that fabric runs out).
 */
export function availableFabricOptions(inventory:Product[],keepIds:Iterable<string>=[]){
  const keep=new Set(keepIds)
  return inventory
    .filter(item=>item.stock>0||keep.has(item.id))
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name))
}

export function fabricOptionLabel(item:Product){
  return `${item.name} — ${round2(item.stock)} ${item.unit} left`
}

/** Total inventory consumed by order lines, keyed by inventory item id. */
export function inventoryUsage(items:OrderItem[]){
  const usage=new Map<string,number>()
  for(const item of items){
    if(lineKind(item)==='inventory'){
      usage.set(item.productId,round2((usage.get(item.productId)||0)+item.qty))
      continue
    }
    for(const fabric of item.fabrics||[]){
      usage.set(fabric.inventoryItemId,round2((usage.get(fabric.inventoryItemId)||0)+fabric.quantity*item.qty))
    }
  }
  return usage
}

/** Sellable product units consumed by order lines, keyed by product id. */
export function productUsage(items:OrderItem[]){
  const usage=new Map<string,number>()
  for(const item of items){
    if(lineKind(item)!=='product') continue
    usage.set(item.productId,(usage.get(item.productId)||0)+item.qty)
  }
  return usage
}

export function describeFabrics(fabrics:FabricUse[]){
  return fabrics.map(f=>`${f.name} (${round2(f.quantity)} ${f.unit})`).join(', ')
}
