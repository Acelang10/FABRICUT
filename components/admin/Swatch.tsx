export default function Swatch({tone,className=''}:{tone:string;className?:string}){
  return <span className={`atelier-swatch ${tone} ${className}`.trim()} aria-hidden="true"/>
}
