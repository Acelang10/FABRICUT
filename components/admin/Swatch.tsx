export default function Swatch({tone,className=''}:{tone?:string;className?:string}){
  return <span className={`atelier-swatch ${tone||'swatch'} ${className}`.trim()} aria-hidden="true"/>
}
