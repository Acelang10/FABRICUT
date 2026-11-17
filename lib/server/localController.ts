import {validateXCommand,parseTelemetry,type XTelemetry} from '../controller/xcommands'

/** True for localhost / 127.0.0.1 / ::1 (with or without a port). */
export function isLoopbackHost(host:string|null|undefined){
  if(!host) return false
  const h=host.trim().toLowerCase()
  const name=h.startsWith('[')?h.slice(1,h.indexOf(']')):h.split(':')[0]
  return name==='localhost'||name==='127.0.0.1'||name==='::1'
}

/**
 * The Local Controller is shown on localhost during development, or anywhere
 * (including Vercel) when LOCAL_CONTROLLER=on. LOCAL_CONTROLLER=off hides it everywhere.
 * Production builds need LOCAL_CONTROLLER=on. Off Vercel, the request must also be to localhost.
 */
export function localControllerEnabled(env:Record<string,string|undefined>=process.env,host?:string|null){
  const flag=(env.LOCAL_CONTROLLER||'').toLowerCase()
  if(flag==='off'||flag==='0'||flag==='false') return false
  const on=flag==='on'||flag==='1'||flag==='true'
  if(env.VERCEL||env.VERCEL_ENV) return on
  const allowedByMode=on||env.NODE_ENV!=='production'
  return allowedByMode&&isLoopbackHost(host)
}

/** True when this process is running on Vercel. The server proxy cannot reach 192.168.4.1 from there. */
export function localControllerIsRemote(env:Record<string,string|undefined>=process.env){
  return Boolean(env.VERCEL||env.VERCEL_ENV)
}

/** ESP32 address. Only private-network http addresses are accepted, so the proxy can't reach the internet. */
export function esp32BaseUrl(env:Record<string,string|undefined>=process.env){
  const raw=(env.ESP32_CONTROLLER_URL||'http://192.168.4.1').trim()
  let url:URL
  try{url=new URL(raw)}catch{throw new Error('ESP32_CONTROLLER_URL is not a valid URL')}
  const host=url.hostname
  const privateHost=/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)||/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)||/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)||host.endsWith('.local')
  if(url.protocol!=='http:'||!privateHost||url.username||url.password) throw new Error('ESP32_CONTROLLER_URL must be http:// on a private address such as 192.168.4.1')
  return `${url.protocol}//${url.host}`
}

export type FetchLike=(input:string,init?:{method?:string;signal?:AbortSignal;cache?:'no-store'})=>Promise<{ok:boolean;status:number;json():Promise<unknown>}>

export interface ProxyResult {ok:boolean;status:number;telemetry:XTelemetry|null;error?:string}

/** Calls the ESP32 Wi-Fi endpoints (/status, /cmd?c=…, /stop) with a short timeout. */
export async function esp32Request(action:'status'|'cmd'|'stop',options:{command?:string;baseUrl?:string;fetchImpl?:FetchLike;timeoutMs?:number}={}):Promise<ProxyResult>{
  let base:string
  try{base=options.baseUrl||esp32BaseUrl()}
  catch(error){return {ok:false,status:500,telemetry:null,error:error instanceof Error?error.message:'ESP32 address not configured'}}
  let path='/status'
  if(action==='stop') path='/stop'
  if(action==='cmd'){
    const command=validateXCommand(options.command||'','wifi')
    path=`/cmd?c=${encodeURIComponent(command)}`
  }
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),options.timeoutMs??1500)
  try{
    const response=await (options.fetchImpl||(fetch as unknown as FetchLike))(base+path,{method:action==='stop'?'POST':'GET',signal:controller.signal,cache:'no-store'})
    const telemetry=parseTelemetry(await response.json().catch(()=>null))
    if(!response.ok||!telemetry) return {ok:false,status:502,telemetry,error:'ESP32 replied with an unexpected answer'}
    return {ok:true,status:200,telemetry}
  }catch{
    return {ok:false,status:504,telemetry:null,error:'ESP32 not reachable. Join the Fabricut-Controller Wi-Fi on this Mac, then try again.'}
  }finally{
    clearTimeout(timer)
  }
}
