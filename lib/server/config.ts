import { config } from 'dotenv'
import path from 'node:path'
config({path:path.join(process.cwd(),'server/.env'),quiet:true})
config({path:path.join(process.cwd(),'.env.local'),quiet:true})
export function firebaseConfig(){
 const result={apiKey:process.env.FIREBASE_API_KEY,authDomain:process.env.FIREBASE_AUTH_DOMAIN,projectId:process.env.FIREBASE_PROJECT_ID,storageBucket:process.env.FIREBASE_STORAGE_BUCKET,messagingSenderId:process.env.FIREBASE_MESSAGING_SENDER_ID,appId:process.env.FIREBASE_APP_ID}
 if(Object.values(result).some(v=>!v))throw new Error('Firebase configuration incomplete')
 return result as Record<keyof typeof result,string>
}
export function approvedStaff(){return (process.env.FIREBASE_OWNER_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)}
