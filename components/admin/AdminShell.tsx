"use client"
import {useEffect,useState,type ReactNode} from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {usePathname,useRouter} from 'next/navigation'
import {api,signOutSession} from '@/lib/client/api'
import type {AppUser} from '@/lib/types'
import NotificationBell from '@/components/NotificationBell'
import UserMenu from '@/components/UserMenu'
import {adminTabs} from '@/lib/adminNav'
import {useOwnProfile} from '@/lib/client/profile'
import {pickAvatarPhoto} from '@/lib/avatar'

export default function AdminShell({children,localController=false}:{children:ReactNode;localController?:boolean}){
  const [user,setUser]=useState<AppUser|null>(null)
  const [error,setError]=useState('')
  const profile=useOwnProfile(Boolean(user))
  const pathname=usePathname()
  const router=useRouter()

  useEffect(()=>{
    let active=true
    api<{user:AppUser}>('/auth/me').then(result=>{
      if(!active) return
      if(result.user.role!=='admin'){router.replace('/shop');return}
      setUser(result.user)
    }).catch(e=>{
      if(!active) return
      setError(e instanceof Error?e.message:'Access denied')
      router.replace('/login')
    })
    return ()=>{active=false}
  },[router])

  async function signout(){
    await signOutSession()
    router.replace('/login')
    router.refresh()
  }

  function active(href:string){
    if(href==='/admin') return pathname==='/admin'
    return pathname===href||pathname.startsWith(href+'/')
  }

  return (
    <div className="atelier">
      <header className="atelier-top">
        <Link href="/admin" className="atelier-brand">
          <Image src="/logo.jpg" alt="JCM Tailoring" width={32} height={32} className="atelier-logo"/>
          FABRI<em>CUT</em>
        </Link>
        <nav className="atelier-tabs" aria-label="Admin">
          {adminTabs(localController).map(([href,label])=>(
            <Link key={href} href={href} className={active(href)?'on':undefined}>{label}</Link>
          ))}
        </nav>
        <NotificationBell tone="admin"/>
        <UserMenu tone="admin" profileHref="/admin/profile" user={{...(user||{role:'admin'}),name:profile?.displayName||user?.name||'admin'}} photoURL={pickAvatarPhoto(profile?.photoUrl,null)} onLogout={signout}/>
      </header>
      <div className="atelier-page">
        {error?<p className="atelier-error" role="alert">{error}</p>:null}
        {user?children:<p role="status">Loading workspace…</p>}
      </div>
    </div>
  )
}
