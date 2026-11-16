"use client"
import {createContext,useContext,useState,useEffect,useCallback,type ReactNode} from 'react'
import {usePathname,useRouter} from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {api} from '@/lib/client/api'
import {firebaseAuth,logout} from '@/lib/client/firebase'
import type {Snapshot,StaffUser,Client,Order,Appointment,Measurements} from '@/lib/types'
interface Store {data:Snapshot;refresh:()=>Promise<void>;mutate:(collection:string,method:string,data?:unknown,id?:string)=>Promise<void>}
const initial:Snapshot={clients:[],orders:[],appointments:[],measurements:{}}
const context=createContext<Store|null>(null)
export function useStore(){const value=useContext(context);if(!value)throw new Error('Dashboard context required');return value}
const navigation=[['','Home Page'],['clients','Client List'],['records','Records'],['schedule','Schedule'],['status','Status'],['about','About Us'],['app-controller','App Controller'],['access','Staff approvals']]
export default function DashboardProvider({children}:{children:ReactNode}){
 const [data,setData]=useState(initial),[user,setUser]=useState<StaffUser|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[menu,setMenu]=useState(false)
 const router=useRouter(),pathname=usePathname()
 const refresh=useCallback(async()=>{setError('');setLoading(true);try{const [clients,orders,appointments,measurements]=await Promise.all([api<Client[]>('/clients'),api<Order[]>('/orders'),api<Appointment[]>('/appointments'),api<Measurements>('/measurements')]);setData({clients,orders,appointments,measurements})}catch(e){setError(e instanceof Error?e.message:'Data unavailable');throw e}finally{setLoading(false)}},[])
 useEffect(()=>{let active=true;(async()=>{try{const auth=await firebaseAuth();if(!auth.currentUser){router.replace('/login');return}const result=await api<{user:StaffUser}>('/auth/me');if(!active)return;setUser(result.user);if(result.user.role!=='pending')await refresh();else setLoading(false)}catch(e){if(active){setError(e instanceof Error?e.message:'Access denied');setLoading(false)}}})();return()=>{active=false}},[refresh,router])
 async function mutate(collection:string,method:string,payload?:unknown,id?:string){await api(`/${collection}${id?`/${encodeURIComponent(id)}`:''}`,method,payload);await refresh()}
 async function signout(){setData(initial);setUser(null);await logout();router.replace('/login')}
 return <context.Provider value={{data,refresh,mutate}}><div className="main-layout"><aside className={`sidebar ${menu?'open':''}`}><div className="sidebar-logo"><Image src="/logo.jpg" alt="JCM Tailoring" width={40} height={40} className="sidebar-logo-img"/><strong>FABRI<em>CUT</em></strong></div><nav className="sidebar-nav">{navigation.map(([slug,label])=><Link key={slug} href={`/dashboard${slug?'/'+slug:''}`} className={`sidebar-nav-item ${pathname===`/dashboard${slug?'/'+slug:''}`?'active':''}`} onClick={()=>setMenu(false)}>{label}</Link>)}</nav><button className="logout-button" onClick={()=>void signout()}>Sign out</button></aside><div className="main-content"><header className="top-bar"><button className="btn top-bar-menu" onClick={()=>setMenu(v=>!v)}>Menu</button><span className="top-bar-user">{user?.email||'Verifying staff access…'}</span></header><main className="page-container">{loading?<p role="status">Connecting to your Firebase project…</p>:error?<section className="card"><h2>Business access unavailable</h2><p role="alert" className="error">{error}</p><p>Sign-in provider, database and security rules must be configured before live operations are available.</p><div className="card-actions"><button className="btn btn-primary" onClick={()=>void refresh().catch(()=>{})}>Retry</button><Link href="/login">Return to sign-in</Link></div></section>:user?.role==='pending'?<PendingAccess/>:user?children:null}</main></div></div></context.Provider>
}

function PendingAccess(){const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);async function request(){setBusy(true);try{const result=await api<{message:string}>('/access/request','POST');setNotice(result.message)}catch(e){setNotice(e instanceof Error?e.message:'Approval service unavailable')}finally{setBusy(false)}}return <section className="card"><h1>Signed in — awaiting owner approval</h1><p>Your sign-in succeeded. Business records and private pattern files remain locked until an owner approves your account.</p><div className="card-actions"><button className="btn btn-primary" disabled={busy} onClick={()=>void request()}>Request staff access</button></div><p role="status">{notice}</p><p>If Firebase is not provisioned yet, owners must complete database and rules setup first.</p></section>}
