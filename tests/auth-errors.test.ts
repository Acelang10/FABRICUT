import test from 'node:test'
import assert from 'node:assert/strict'
import {authErrorMessage} from '../lib/client/firebase'

test('maps common Firebase auth codes to friendly messages',()=>{
 const codes:Record<string,string>={
  'auth/wrong-password':'Incorrect email or password.',
  'auth/invalid-credential':'Incorrect email or password.',
  'auth/user-not-found':'Incorrect email or password.',
  'auth/email-already-in-use':'An account already exists for that email. Sign in, or use Forgot password.',
  'auth/weak-password':'Please choose a stronger password (at least 6 characters).',
  'auth/too-many-requests':'Too many attempts. Please wait and try again.',
  'auth/operation-not-allowed':'Email and password sign-in is not enabled yet. Try Google sign-in, or try again shortly.',
  'auth/invalid-email':'Please enter a valid email address.',
  'auth/popup-blocked':'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.',
  'auth/web-storage-unsupported':'Google sign-in needs browser storage. Allow cookies/storage for this site, or try another browser.',
 }
 for(const [code,message] of Object.entries(codes))assert.equal(authErrorMessage({code}),message)
 assert.equal(authErrorMessage(new Error('Custom failure')),'Custom failure')
 assert.equal(
  authErrorMessage(new Error('Unable to process request due to missing initial state. This may happen if browser sessionStorage is inaccessible or accidentally cleared, which can occur in a signInWithRedirect in a storage-partitioned browser environment.')),
  'Google sign-in could not finish in this browser. Allow popups and storage for this site, then try again.',
 )
})
