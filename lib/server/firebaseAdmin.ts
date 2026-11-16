import {applicationDefault,cert,getApps,initializeApp,type App,type ServiceAccount} from 'firebase-admin/app'
import {getFirestore,type Firestore} from 'firebase-admin/firestore'

export function hasAdminCredentials(){
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
  )
}

function serviceAccountFromEnv(): ServiceAccount {
  if(process.env.FIREBASE_SERVICE_ACCOUNT){
    const parsed=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount
    return parsed
  }
  const projectId=process.env.FIREBASE_PROJECT_ID
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL
  const privateKey=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n')
  if(!projectId||!clientEmail||!privateKey) throw new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING')
  return {projectId,clientEmail,privateKey}
}

function initApp():App{
  const existing=getApps()[0]
  if(existing) return existing
  const projectId=process.env.FIREBASE_PROJECT_ID
  if(process.env.FIREBASE_SERVICE_ACCOUNT || (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)){
    return initializeApp({credential:cert(serviceAccountFromEnv()),projectId})
  }
  if(process.env.GOOGLE_APPLICATION_CREDENTIALS){
    return initializeApp({credential:applicationDefault(),projectId})
  }
  throw new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING')
}

let db:Firestore|undefined
export function adminFirestore():Firestore{
  if(!db){
    // Default database in project fabricut-248b4 (asia-southeast1).
    db=getFirestore(initApp())
  }
  return db
}

export const missingAdminCredentialsMessage=[
  'Firebase Admin credentials are missing, so the shop store cannot use Firestore yet.',
  'Add one of the following to .env.local (do not commit it):',
  '- GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json',
  '- FIREBASE_SERVICE_ACCOUNT=<service account JSON string>',
  '- FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY (plus existing FIREBASE_PROJECT_ID)',
  'Create a service account in Firebase project fabricut-248b4 with Cloud Datastore User or Firebase Admin access.',
  'Set SHOP_STORE=firestore to require Firestore, or SHOP_STORE=json to force the local JSON fallback.',
].join(' ')
