import { readBearerToken, isApprovedStaff } from './staffPolicy.js'
import { verifyFirebaseToken } from './verifyFirebaseToken.js'
import { createUserContext, requestContext } from './requestContext.js'
import { approvedStaff, firebaseConfig } from './firebaseConfig.js'
export function makeRequireStaff({verify=verifyFirebaseToken,createContext=createUserContext,emails=approvedStaff,project=()=>firebaseConfig().projectId}={}) {
  return async function requireStaff(req,res,next) {
    const token=readBearerToken(req.get('authorization'))
    if (!token) return res.status(401).json({error:'Firebase sign-in required'})
    let claims
    try { claims=await verify(token,project()) } catch { return res.status(401).json({error:'Invalid or expired Firebase identity'}) }
    if (!isApprovedStaff(claims,emails(),project())) return res.status(403).json({error:'Staff access has not been approved'})
    let context
    try { context=await createContext(token,claims) } catch { return res.status(503).json({error:'Authenticated Firebase context unavailable'}) }
    let closed=false
    const cleanup=()=>{ if (!closed) {closed=true; Promise.resolve(context.close()).catch(()=>{})} }
    res.once('finish',cleanup); res.once('close',cleanup)
    req.user={uid:claims.sub,email:claims.email,role:'admin'}
    requestContext.run(context,()=>next())
  }
}
export const requireAuth=makeRequireStaff()
