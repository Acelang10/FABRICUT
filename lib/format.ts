export function peso(value:number){
  const rounded=Math.round(value*100)/100
  const formatted=rounded.toLocaleString('en-PH',{minimumFractionDigits:Number.isInteger(rounded)?0:2,maximumFractionDigits:2})
  return `₱${formatted}`
}
