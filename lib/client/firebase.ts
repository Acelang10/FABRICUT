import {initializeApp,type FirebaseOptions} from 'firebase/app'
import {createUserWithEmailAndPassword,getAuth,getRedirectResult,GoogleAuthProvider,sendEmailVerification,sendPasswordResetEmail,signInWithEmailAndPassword,signInWithPopup,signInWithRedirect,signOut,updateProfile,type Auth} from 'firebase/auth'
let pending:Promise<Auth>|undefined
export function firebaseAuth(){if(!pending)pending=(async()=>{const r=await fetch('/api/auth/config',{cache:'no-store'});if(!r.ok)throw new Error('Firebase configuration unavailable');const auth=getAuth(initializeApp(await r.json() as FirebaseOptions));await auth.authStateReady();return auth})().catch(e=>{pending=undefined;throw e});return pending}
export async function authHeaders(){const auth=await firebaseAuth();if(!auth.currentUser)throw new Error('Sign in with an approved account');return {Authorization:`Bearer ${await auth.currentUser.getIdToken()}`}}
const POPUP_FALLBACK_CODES=new Set(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'])

/** Use popup with the default firebaseapp.com authDomain. Redirect only if the popup cannot open. */
export function shouldFallbackToRedirect(error:unknown){
 const code=typeof error==='object'&&error&&'code' in error?String((error as {code:unknown}).code):''
 const message=error instanceof Error?error.message:typeof error==='object'&&error&&'message' in error?String((error as {message:unknown}).message):''
 return POPUP_FALLBACK_CODES.has(code)||/popup was blocked|popup-blocked/i.test(message)
}

export async function googleLogin(){
 const auth=await firebaseAuth()
 const provider=new GoogleAuthProvider()
 try{
  await signInWithPopup(auth,provider)
 }catch(error){
  if(!shouldFallbackToRedirect(error)) throw error
  await signInWithRedirect(auth,provider)
 }
}

export async function completeGoogleRedirect(){
 return getRedirectResult(await firebaseAuth())
}

export async function emailSignIn(email:string,password:string){await signInWithEmailAndPassword(await firebaseAuth(),email,password)}
export async function emailSignUp(email:string,password:string,name:string){
 const auth=await firebaseAuth()
 const {user}=await createUserWithEmailAndPassword(auth,email,password)
 const trimmed=name.trim()
 if(trimmed)await updateProfile(user,{displayName:trimmed}).catch(()=>{})
 await sendEmailVerification(user)
}
export async function requestEmailVerification(){
 const user=(await firebaseAuth()).currentUser
 if(user&&!user.emailVerified)await sendEmailVerification(user)
}
export async function emailPasswordReset(email:string){await sendPasswordResetEmail(await firebaseAuth(),email)}
export async function logout(){await signOut(await firebaseAuth())}
export function authErrorMessage(error:unknown,fallback='Sign-in failed'){
 const code=typeof error==='object'&&error&&'code' in error?String((error as {code:unknown}).code):''
 switch(code){
  case 'auth/wrong-password':
  case 'auth/invalid-credential':
  case 'auth/user-not-found':
   return 'Incorrect email or password.'
  case 'auth/email-already-in-use':
   return 'An account already exists for that email. Sign in, or use Forgot password.'
  case 'auth/weak-password':
   return 'Please choose a stronger password (at least 6 characters).'
  case 'auth/too-many-requests':
   return 'Too many attempts. Please wait and try again.'
  case 'auth/operation-not-allowed':
   return 'Email and password sign-in is not enabled yet. Try Google sign-in, or try again shortly.'
  case 'auth/invalid-email':
  case 'auth/missing-email':
   return 'Please enter a valid email address.'
  case 'auth/missing-password':
   return 'Please enter your password.'
  case 'auth/user-disabled':
   return 'This account has been disabled.'
  case 'auth/network-request-failed':
   return 'Network error. Check your connection and try again.'
  case 'auth/popup-closed-by-user':
  case 'auth/cancelled-popup-request':
   return 'Google sign-in was cancelled.'
  case 'auth/popup-blocked':
   return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.'
  case 'auth/web-storage-unsupported':
   return 'Google sign-in needs browser storage. Allow cookies/storage for this site, or try another browser.'
  default:
   if(typeof error==='object'&&error&&'message' in error&&/missing initial state|sessionStorage is inaccessible|signInWithRedirect/i.test(String((error as {message:unknown}).message))){
    return 'Google sign-in could not finish in this browser. Allow popups and storage for this site, then try again.'
   }
   return error instanceof Error&&error.message?error.message:fallback
 }
}
