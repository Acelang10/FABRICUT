import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
const base=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'')
export const API_BASE=base ? (base.endsWith('/api')?base:`${base}/api`) : '/api'
let pending
export function firebaseAuth() {
 if (!pending) pending=(async()=>{
  const response=await fetch(`${API_BASE}/auth/config`)
  if (!response.ok) throw new Error('Firebase configuration unavailable')
  const auth=getAuth(initializeApp(await response.json()))
  await auth.authStateReady()
  return auth
 })().catch(e=>{pending=null;throw e})
 return pending
}
export async function authorizationHeaders() {
 const auth=await firebaseAuth()
 if (!auth.currentUser) throw new Error('Sign in with an approved staff Google account')
 return {Authorization:`Bearer ${await auth.currentUser.getIdToken()}`}
}
export async function googleSignIn() {return signInWithPopup(await firebaseAuth(),new GoogleAuthProvider())}
export async function firebaseSignOut() {return signOut(await firebaseAuth())}
