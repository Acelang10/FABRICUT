import { reactive } from 'vue'
import { API_BASE, authorizationHeaders, firebaseAuth, googleSignIn, firebaseSignOut } from './firebase.js'
// Remove old opaque tokens; browser storage is not an authorization source.
localStorage.removeItem('fabricut-token');localStorage.removeItem('fabricut-user')
const auth=reactive({token:null,user:null})
async function checkStaff() {
 const response=await fetch(`${API_BASE}/auth/me`,{headers:await authorizationHeaders()})
 if (!response.ok) throw new Error(response.status===403?'This Google account has not been approved for staff access.':'Staff identity could not be verified.')
 const data=await response.json();auth.user=data.user;auth.token='firebase-session';return data
}
export async function ensureSession() {
 try {const instance=await firebaseAuth();if (!instance.currentUser) {auth.token=null;auth.user=null;return false} await checkStaff();return true}
 catch {auth.token=null;auth.user=null;return false}
}
export async function login() {
 try {await googleSignIn();return await checkStaff()}
 catch(error){await logout();throw error}
}
export async function logout() {auth.token=null;auth.user=null;await firebaseSignOut()}
export function useAuth(){return {auth,login,logout}}
