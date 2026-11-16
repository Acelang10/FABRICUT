import {round2} from '@/lib/fabrics'
import type {FabricUse} from '@/lib/types'

export default function FabricList({fabrics,label='Fabrics used'}:{fabrics:FabricUse[];label?:string}){
  if(!fabrics.length) return null
  return (
    <div className="atelier-fabrics">
      <span className="atelier-fabrics-label">{label}</span>
      <ul>
        {fabrics.map(f=>(
          <li key={f.inventoryItemId}><b>{f.name}</b> · {round2(f.quantity)} {f.unit}</li>
        ))}
      </ul>
    </div>
  )
}
