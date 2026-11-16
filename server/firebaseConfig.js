import './loadEnv.js'
export function firebaseConfig() {
  const config = Object.fromEntries(Object.entries({apiKey:'FIREBASE_API_KEY',authDomain:'FIREBASE_AUTH_DOMAIN',projectId:'FIREBASE_PROJECT_ID',storageBucket:'FIREBASE_STORAGE_BUCKET',messagingSenderId:'FIREBASE_MESSAGING_SENDER_ID',appId:'FIREBASE_APP_ID'}).map(([k,v])=>[k,process.env[v]]))
  if (Object.values(config).some(v=>!v)) throw new Error('Firebase configuration incomplete')
  return config
}
export function approvedStaff() { return (process.env.FIREBASE_STAFF_EMAILS || '').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean) }
