"use client"
import {useEffect,useId,useRef,useState} from 'react'
import Link from 'next/link'
import {avatarInitial,displayName,safePhotoUrl} from '@/lib/avatar'

interface MenuUser {role?:string;name?:string|null;email?:string|null}

/**
 * Avatar button that replaces "Sign out" in the top bar. Opens a small menu with the user's
 * name at the top, then Profile, then Log out. Closes on outside click, Escape, or after choosing.
 */
export default function UserMenu({user,photoURL,tone,profileHref,onLogout}:{user:MenuUser|null;photoURL?:string|null;tone:'admin'|'shop';profileHref:string;onLogout:()=>Promise<void>|void}){
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [photoFailed,setPhotoFailed]=useState(false)
  const wrap=useRef<HTMLDivElement>(null)
  const button=useRef<HTMLButtonElement>(null)
  const profileItem=useRef<HTMLAnchorElement>(null)
  const logoutItem=useRef<HTMLButtonElement>(null)
  const menuId=useId()
  const photo=photoFailed?'':safePhotoUrl(photoURL)
  useEffect(()=>{setPhotoFailed(false)},[photoURL])
  const name=displayName(user)

  useEffect(()=>{
    if(!open) return
    function onDown(e:MouseEvent|TouchEvent){ if(wrap.current&&!wrap.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e:KeyboardEvent){
      if(e.key==='Escape'){ setOpen(false); button.current?.focus(); return }
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault()
        const items=[profileItem.current,logoutItem.current].filter(Boolean) as HTMLElement[]
        const at=items.indexOf(document.activeElement as HTMLElement)
        items[(at+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus()
      }
    }
    document.addEventListener('mousedown',onDown)
    document.addEventListener('touchstart',onDown)
    document.addEventListener('keydown',onKey)
    profileItem.current?.focus()
    return ()=>{
      document.removeEventListener('mousedown',onDown)
      document.removeEventListener('touchstart',onDown)
      document.removeEventListener('keydown',onKey)
    }
  },[open])

  async function logout(){
    setBusy(true)
    try{ await onLogout() }finally{ setBusy(false); setOpen(false) }
  }

  return (
    <div className={`atelier-user atelier-user-${tone}`} ref={wrap}>
      <button
        ref={button}
        type="button"
        className="atelier-avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open?menuId:undefined}
        aria-label={`Account menu for ${name||'you'}`}
        onClick={()=>setOpen(o=>!o)}
      >
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ?<img src={photo} alt="" className="atelier-avatar" referrerPolicy="no-referrer" onError={()=>setPhotoFailed(true)}/>
          :<span className="atelier-avatar atelier-avatar-initial" aria-hidden="true">{avatarInitial(user)}</span>}
      </button>
      {open?(
        <div className="atelier-user-menu" role="menu" id={menuId} aria-label="Account">
          <div className="atelier-user-head" role="presentation">
            <strong>{name}</strong>
            {user?.email&&user.email!==name&&user.role!=='admin'?<span>{user.email}</span>:null}
            {user?.role==='admin'?<span>Administrator</span>:null}
          </div>
          <Link ref={profileItem} href={profileHref} role="menuitem" className="atelier-user-logout atelier-user-item" onClick={()=>setOpen(false)}>Profile</Link>
          <button ref={logoutItem} type="button" role="menuitem" className="atelier-user-logout" disabled={busy} onClick={()=>void logout()}>
            {busy?'Logging out…':'Log out'}
          </button>
        </div>
      ):null}
    </div>
  )
}
