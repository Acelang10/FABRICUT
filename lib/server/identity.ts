import { decodeProtectedHeader, importX509, jwtVerify, type JWTPayload, type CryptoKey } from 'jose'
export interface Identity extends JWTPayload {email?:string;email_verified?:boolean;firebase?:{sign_in_provider?:string};auth_time?:number}
let cached:Record<string,string>|undefined,expires=0,pending:Promise<Record<string,string>>|undefined
async function certificates():Promise<Record<string,string>> {
 if(cached&&Date.now()<expires)return cached
 if(!pending)pending=(async()=>{const r=await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw new Error('Verification unavailable');const data=await r.json() as Record<string,string>;const age=Number(/max-age=(\d+)/.exec(r.headers.get('cache-control')||'')?.[1]||0);cached=data;expires=Date.now()+Math.min(age,86400)*1000;return data})().finally(()=>{pending=undefined})
 return pending
}
export async function verifyJwt(token:string,key:CryptoKey|Uint8Array,project:string):Promise<Identity>{
 const {payload}=await jwtVerify(token,key,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${project}`,audience:project,requiredClaims:['exp','iat','sub','auth_time'],maxTokenAge:'1h'})
 const p=payload as Identity,now=Date.now()/1000
 if(!p.sub||p.sub.length>128||!Number.isFinite(p.auth_time)||p.auth_time!>now||p.iat!>now)throw new Error('Invalid identity')
 return p
}
export async function verifyToken(token:string,project:string):Promise<Identity>{
 const header=decodeProtectedHeader(token);if(header.alg!=='RS256'||typeof header.kid!=='string')throw new Error('Invalid identity')
 const keys=await certificates();if(!Object.hasOwn(keys,header.kid))throw new Error('Invalid key')
 return verifyJwt(token,await importX509(keys[header.kid],'RS256'),project)
}
export function bearer(header:string|null){return header&&/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header)?.[1]||null}
export function approved(p:Identity,emails:string[],project:string){const now=Date.now()/1000;return !!(p.sub&&p.aud===project&&p.iss===`https://securetoken.google.com/${project}`&&p.exp&&p.exp>now&&p.iat&&p.iat<=now&&p.email_verified===true&&p.firebase?.sign_in_provider==='google.com'&&p.email&&emails.includes(p.email.toLowerCase()))}
export function verifiedIdentity(p:Identity){return !!(p.email&&p.email_verified===true&&(p.firebase?.sign_in_provider==='google.com'||p.firebase?.sign_in_provider==='password'))}
