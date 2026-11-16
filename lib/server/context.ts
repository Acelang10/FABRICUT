import { AsyncLocalStorage } from 'node:async_hooks'
import { initializeServerApp, deleteApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import {firebaseConfig} from './config'
import type {Identity} from './identity'
export interface UserContext {uid:string;db:Firestore;close:()=>Promise<void>}
export const contexts=new AsyncLocalStorage<UserContext>()
export async function createContext(token:string,claims:Identity):Promise<UserContext>{
 const app=initializeServerApp(firebaseConfig(),{authIdToken:token})
 try{const auth=getAuth(app);await auth.authStateReady();if(!auth.currentUser||auth.currentUser.uid!==claims.sub)throw new Error('Identity mismatch');return {uid:claims.sub!,db:getFirestore(app),close:()=>deleteApp(app)}}catch(e){await deleteApp(app);throw e}
}
export function currentDb(){const c=contexts.getStore();if(!c?.uid)throw new Error('Authenticated context required');return c.db}
