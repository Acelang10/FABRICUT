import { decodeProtectedHeader, importX509, jwtVerify } from 'jose'
const certificatesUrl = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
let cached, expires = 0, pending
async function certificates() {
  if (cached && Date.now() < expires) return cached
  if (!pending) pending = (async()=>{
    const response = await fetch(certificatesUrl, {signal:AbortSignal.timeout(10000)})
    if (!response.ok) throw new Error('Identity verification unavailable')
    const data=await response.json()
    const age=Number(/max-age=(\d+)/.exec(response.headers.get('cache-control')||'')?.[1]||0)
    cached=data; expires=Date.now()+Math.min(age,86400)*1000
    return data
  })().finally(()=>{ pending=null })
  return pending
}
export async function verifyFirebaseToken(token, projectId) {
  const header=decodeProtectedHeader(token)
  if (header.alg!=='RS256' || typeof header.kid!=='string') throw new Error('Invalid identity')
  const certs=await certificates()
  if (!Object.hasOwn(certs,header.kid)) throw new Error('Invalid signing key')
  const key=await importX509(certs[header.kid],'RS256')
  return verifyFirebaseJwt(token,key,projectId)
}
export async function verifyFirebaseJwt(token,key,projectId) {
  const {payload}=await jwtVerify(token,key,{algorithms:['RS256'],audience:projectId,issuer:`https://securetoken.google.com/${projectId}`,requiredClaims:['exp','iat','sub','auth_time'],maxTokenAge:'1h'})
  const now=Date.now()/1000
  if (!Number.isFinite(payload.auth_time) || payload.auth_time>now || payload.iat>now) throw new Error('Invalid token times')
  return payload
}
