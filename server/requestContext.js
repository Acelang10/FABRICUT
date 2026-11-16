import { AsyncLocalStorage } from 'node:async_hooks'
import { initializeServerApp, deleteApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig.js'
export const requestContext = new AsyncLocalStorage()
export async function createUserContext(token, claims) {
  const app=initializeServerApp(firebaseConfig(),{authIdToken:token})
  try {
    const auth=getAuth(app)
    await auth.authStateReady()
    if (!auth.currentUser || auth.currentUser.uid!==claims.sub) throw new Error('Firebase identity mismatch')
    return {db:getFirestore(app),uid:claims.sub,close:()=>deleteApp(app)}
  } catch(error) { await deleteApp(app); throw error }
}
export function requestDb() {
  const context=requestContext.getStore()
  if (!context?.db || !context.uid) throw new Error('Authenticated request context required')
  return context.db
}
