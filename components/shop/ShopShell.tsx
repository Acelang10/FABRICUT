"use client"
import {useCallback,useEffect,useState,type ReactNode} from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {usePathname,useRouter} from 'next/navigation'
import {api,signOutSession} from '@/lib/client/api'
import {firebaseAuth,logout} from '@/lib/client/firebase'
import {cartCount,readCart,type CartLine} from '@/lib/client/cart'
import type {AppUser} from '@/lib/types'
import CartDrawer from './CartDrawer'
import NotificationBell from '@/components/NotificationBell'
import UserMenu from '@/components/UserMenu'
import {useOwnProfile} from '@/lib/client/profile'
import {pickAvatarPhoto} from '@/lib/avatar'

export default function ShopShell({children,openCart=false}:{children:ReactNode;openCart?:boolean}){
  const [user,setUser]=useState<AppUser|null>(null)
  const [lines,setLines]=useState<CartLine[]>([])
  const [cartOpen,setCartOpen]=useState(openCart)
  const [photoURL,setPhotoURL]=useState<string|null>(null)
  const [profileName,setProfileName]=useState<string|null>(null)
  const profile=useOwnProfile(Boolean(user))
  const pathname=usePathname()
  const router=useRouter()

  const reloadCart=useCallback((uid:string)=>{setLines(readCart(uid))},[])

  useEffect(()=>{
    let active=true
    api<{user:AppUser}>('/auth/me').then(result=>{
      if(!active) return
      setUser(result.user)
      setLines(readCart(result.user.uid))
    }).catch(()=>{if(active) router.replace('/login')})
    // Google profile photo/name, when the customer signed in with Firebase on this browser.
    firebaseAuth().then(auth=>{
      if(!active||!auth.currentUser) return
      setPhotoURL(auth.currentUser.photoURL)
      setProfileName(auth.currentUser.displayName)
    }).catch(()=>{})
    return ()=>{active=false}
  },[router])

  useEffect(()=>{
    function onUpdate(){ if(user) setLines(readCart(user.uid)) }
    window.addEventListener('fabricut-cart',onUpdate)
    window.addEventListener('storage',onUpdate)
    return ()=> {
      window.removeEventListener('fabricut-cart',onUpdate)
      window.removeEventListener('storage',onUpdate)
    }
  },[user])

  async function signout(){
    await signOutSession()
    await logout().catch(()=>{})
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="atelier atelier-shop">
      <header className="atelier-shop-top">
        <Link href="/shop" className="atelier-brand atelier-brand-ink">
          <Image src="/logo.jpg" alt="JCM Tailoring" width={32} height={32} className="atelier-logo"/>
          FABRI<em>CUT</em>
        </Link>
        <nav className="atelier-shop-nav" aria-label="Shop">
          <Link href="/shop" className={pathname==='/shop'?'on':undefined}>Products</Link>
          <Link href="/shop/orders" className={pathname.startsWith('/shop/orders')?'on':undefined}>My Orders</Link>
        </nav>
        {user?.role==='admin'?<Link href="/admin" className="atelier-admin-link">Admin</Link>:null}
        <NotificationBell tone="shop"/>
        <button type="button" className="atelier-cart-btn" onClick={()=>setCartOpen(true)}>
          Cart <span className="atelier-badge">{cartCount(lines)}</span>
        </button>
        <UserMenu tone="shop" profileHref="/shop/profile" user={user?{...user,name:profile?.displayName||user.name||profileName}:null} photoURL={pickAvatarPhoto(profile?.photoUrl,photoURL)} onLogout={signout}/>
      </header>
      <div className="atelier-shop-page">{user?children:<p role="status">Loading shop…</p>}</div>
      {user?(
        <CartDrawer
          open={cartOpen}
          uid={user.uid}
          lines={lines}
          onClose={()=>setCartOpen(false)}
          onChange={()=>reloadCart(user.uid)}
        />
      ):null}
    </div>
  )
}
