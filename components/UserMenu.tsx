"use client"
import {useEffect,useId,useRef,useState} from 'react'
import {avatarInitial,displayName,safePhotoUrl} from '@/lib/avatar'

interface MenuUser {role?:string;name?:string|null;email?:string|null}

/**
 * Avatar button that replaces "Sign out" in the top bar. Opens a small menu with the user's
 * name at the top and Log out below. Closes on outside click, Escape, or after choosing.
 */
export default function UserMenu({user,photoURL,tone,onLogout}:{user:MenuUser|null;photoURL?:string|null;tone:'admin'|'shop';onLogout:()=>Promise<void>|void}){
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [photoFailed,setPhotoFailed]=useState(false)
  const wrap=useRef<HTMLDivElement>(null)
  const button=useRef<HTMLButtonElement>(null)
  const logoutItem=useRef<HTMLButtonElement>(null)
  const menuId=useId()
  const photo=user?.role==='admin'||photoFailed?'':safePhotoUrl(photoURL)
  const name=displayName(user)

  useEffect(()=>{
    if(!open) return
    function onDown(e:MouseEvent|TouchEvent){ if(wrap.current&&!wrap.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e:KeyboardEvent){ if(e.key==='Escape'){ setOpen(false); button.current?.focus() } }
    document.addEventListener('mousedown',onDown)
    document.addEventListener('touchstart',onDown)
    document.addEventListener('keydown',onKey)
    logoutItem.current?.focus()
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
          <button ref={logoutItem} type="button" role="menuitem" className="atelier-user-logout" disabled={busy} onClick={()=>void logout()}>
            {busy?'Logging out…':'Log out'}
          </button>
        </div>
      ):null}
    </div>
  )
}
