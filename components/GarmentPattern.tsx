import {clothingLabel,styleLabel} from '@/lib/clothing'

/*
 * Simple front/back flat pattern pieces for each clothing type and style.
 * Solid line = cut line, dashed line = stitch line (seam allowance). Drawn in a 90×110 box per piece.
 */
type Piece='front'|'back'

function neck(style:string,piece:Piece){
  if(piece==='back') return 'Q45,13 60,8'
  if(style==='vneck') return 'L45,32 L60,8'
  if(style==='scoop') return 'Q45,32 60,8'
  return 'Q45,22 60,8'
}

const shortTop=(n:string,w=0)=>`M30,8 ${n} L76,14 L90,34 L78,42 L${72-w},34 L${72-w},104 L${18+w},104 L${18+w},34 L12,42 L0,34 L14,14 Z`
const longTop=(n:string)=>`M30,8 ${n} L76,14 L90,82 L80,84 L72,38 L72,104 L18,104 L18,38 L10,84 L0,82 L14,14 Z`

function outline(type:string,style:string,piece:Piece){
  switch(type){
    case 'polo': return shortTop(neck('crew',piece),style==='slim'?5:0)
    case 'longsleeve': return longTop(neck(style==='henley'?'crew':style,piece))
    case 'hoodie': case 'jacket': return longTop(neck(type==='jacket'&&style==='blazer'&&piece==='front'?'vneck':'crew',piece))
    case 'dress': {
      const n=piece==='back'?'Q46,12 60,6':'Q46,22 60,6'
      if(style==='shift') return `M32,6 ${n} L66,10 L64,40 L70,106 L20,106 L26,40 L24,10 Z`
      return `M32,6 ${n} L66,10 L64,40 L86,106 L4,106 L26,40 L24,10 Z`
    }
    case 'pants':
      if(style==='slim') return 'M14,4 L76,4 L72,106 L52,106 L45,40 L38,106 L18,106 Z'
      if(style==='wide') return 'M14,4 L76,4 L88,106 L54,106 L45,44 L36,106 L2,106 Z'
      return 'M14,4 L76,4 L80,106 L52,106 L45,40 L38,106 L10,106 Z'
    case 'shorts':
      if(style==='athletic') return 'M12,20 L78,20 L84,74 Q68,66 52,74 L45,50 L38,74 Q22,66 6,74 Z'
      return 'M12,20 L78,20 L84,76 L52,76 L45,50 L38,76 L6,76 Z'
    default: return shortTop(neck(style,piece))
  }
}

function details(type:string,style:string,piece:Piece){
  const d:string[]=[]
  if(type==='polo'&&piece==='front'){ d.push('M45,16 L45,36','M36,10 L45,18 L54,10'); if(style==='pocket') d.push('M54,48 h12 v14 h-12 Z') }
  if(type==='longsleeve'&&style==='henley'&&piece==='front') d.push('M45,20 L45,40','M43,26 h4','M43,33 h4')
  if(type==='hoodie'){
    if(piece==='back') d.push('M28,10 Q45,-10 62,10')
    else { d.push('M30,8 Q45,-2 60,8'); d.push(style==='zip'?'M45,20 L45,104':'M28,78 L62,78 L68,100 L22,100 Z') }
  }
  if(type==='jacket'){
    d.push('M18,96 L72,96','M10,78 L20,77','M80,78 L70,77')
    if(piece==='front'){
      d.push('M45,20 L45,104')
      if(style==='blazer') d.push('M30,8 L38,42 L45,60','M60,8 L52,42 L45,60')
      if(style==='denim') d.push('M24,44 h14 v8 h-14 Z','M52,44 h14 v8 h-14 Z')
      if(style==='bomber') d.push('M30,8 Q45,18 60,8')
    }
  }
  if(type==='dress'&&style==='wrap'&&piece==='front') d.push('M60,8 L26,46')
  if(type==='dress') d.push('M26,40 L64,40')
  if(type==='pants'){ d.push(piece==='front'?'M20,4 Q22,18 14,22':'M14,16 L76,20'); d.push('M14,10 L76,10') }
  if(type==='shorts'){
    d.push('M12,26 L78,26')
    if(piece==='front') d.push('M20,20 Q22,32 13,36')
    if(style==='cargo') d.push('M8,46 h12 v14 h-12 Z','M70,46 h12 v14 h-12 Z')
  }
  return d
}

export default function GarmentPattern({type,style,size='md',showLabel=false}:{type:string;style:string;size?:'sm'|'md'|'lg';showLabel?:boolean}){
  const label=`${clothingLabel(type)} pattern, ${styleLabel(type,style)}`
  return (
    <figure className={`garment-pattern garment-${size}`}>
      <svg viewBox="-6 -14 212 136" role="img" aria-label={label}>
        <title>{label}</title>
        {(['front','back'] as Piece[]).map((piece,i)=>(
          <g key={piece} transform={`translate(${i*110},0)`}>
            <path d={outline(type,style,piece)} className="gp-cut"/>
            <path d={outline(type,style,piece)} className="gp-stitch" transform="translate(4.5,5.5) scale(0.9)"/>
            {details(type,style,piece).map((d,j)=><path key={j} d={d} className="gp-detail"/>)}
            <text x="45" y="118" textAnchor="middle" className="gp-label">{piece==='front'?'FRONT':'BACK'}</text>
          </g>
        ))}
      </svg>
      {showLabel?<figcaption>{styleLabel(type,style)}</figcaption>:null}
    </figure>
  )
}
