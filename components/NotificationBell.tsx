"use client"
import {useCallback,useEffect,useId,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import {api} from '@/lib/client/api'
import type {ShopNotification} from '@/lib/types'

const POLL_MS=25_000

type NotificationsResponse={
  notifications?:ShopNotification[]
  unread?:number
  unreadCount?:number
}

function unreadFrom(result:Pick<NotificationsResponse,'unread'|'unreadCount'>){
  const count=result.unreadCount??result.unread??0
  return Number.isFinite(count)?Math.max(0,Math.trunc(count)):0
}

function badgeLabel(count:number){
  return count>99?'99+':String(count)
}

export default function NotificationBell({tone}:{tone:'admin'|'shop'}){
  const [open,setOpen]=useState(false)
  const [items,setItems]=useState<ShopNotification[]>([])
  const [unread,setUnread]=useState(0)
  const [error,setError]=useState('')
  const [pulse,setPulse]=useState(false)
  const root=useRef<HTMLDivElement>(null)
  const prevUnread=useRef(0)
  const router=useRouter()
  const panelId=useId()

  const applyUnread=(count:number)=>{
    if(count>prevUnread.current){
      setPulse(false)
      requestAnimationFrame(()=>setPulse(true))
    }
    prevUnread.current=count
    setUnread(count)
  }

  const load=useCallback(async()=>{
    try{
      const result=await api<NotificationsResponse>('/notifications')
      setItems(result.notifications||[])
      applyUnread(unreadFrom(result))
      setError('')
    }catch(e){
      setError(e instanceof Error?e.message:'Notifications unavailable')
    }
  },[])

  useEffect(()=>{
    void load()
    const timer=window.setInterval(()=>void load(),POLL_MS)
    function onFocus(){ void load() }
    function onVis(){ if(document.visibilityState==='visible') void load() }
    window.addEventListener('focus',onFocus)
    document.addEventListener('visibilitychange',onVis)
    return ()=>{
      window.clearInterval(timer)
      window.removeEventListener('focus',onFocus)
      document.removeEventListener('visibilitychange',onVis)
    }
  },[load])

  useEffect(()=>{
    if(!open) return
    void load()
    function onPointer(event:MouseEvent){
      if(root.current&&!root.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event:KeyboardEvent){
      if(event.key==='Escape') setOpen(false)
    }
    document.addEventListener('mousedown',onPointer)
    document.addEventListener('keydown',onKey)
    return ()=>{
      document.removeEventListener('mousedown',onPointer)
      document.removeEventListener('keydown',onKey)
    }
  },[open,load])

  async function openItem(item:ShopNotification){
    if(!item.read){
      setItems(current=>current.map(entry=>entry.id===item.id?{...entry,read:true}:entry))
      applyUnread(Math.max(0,prevUnread.current-1))
      try{
        const result=await api<NotificationsResponse>('/notifications/read','POST',{ids:[item.id]})
        applyUnread(unreadFrom(result))
      }catch{}
    }
    setOpen(false)
    if(item.link) router.push(item.link)
    void load()
  }

  async function markAll(){
    setItems(current=>current.map(entry=>({...entry,read:true})))
    applyUnread(0)
    try{
      const result=await api<NotificationsResponse>('/notifications/read','POST',{all:true})
      applyUnread(unreadFrom(result))
    }catch{}
    void load()
  }

  const label=unread>0?`Notifications, ${unread} unread`:'Notifications'

  return (
    <div className="atelier-bell-slot" ref={root}>
      <button
        type="button"
        className={`atelier-bell atelier-bell-${tone}`}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={()=>setOpen(value=>!value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
        {unread>0?(
          <span className={`atelier-bell-badge${pulse?' is-pulse':''}`} aria-hidden="true" onAnimationEnd={()=>setPulse(false)}>
            {badgeLabel(unread)}
          </span>
        ):null}
      </button>
      <span className="atelier-bell-live" aria-live="polite">
        {unread>0?`${unread} unread notifications`:'No unread notifications'}
      </span>
      {open?(
        <div className="atelier-bell-panel" id={panelId} role="region" aria-label="Notification list">
          <div className="atelier-bell-head">
            <strong>Notifications</strong>
            <button type="button" className="atelier-bell-all" onClick={()=>void markAll()} disabled={unread===0}>Mark all read</button>
          </div>
          {error?<p className="atelier-bell-empty" role="alert">{error}</p>:null}
          {!error&&items.length===0?<p className="atelier-bell-empty">No notifications yet.</p>:null}
          <ul className="atelier-bell-list">
            {items.map(item=>(
              <li key={item.id}>
                <button type="button" className={`atelier-bell-item${item.read?'':' unread'}`} onClick={()=>void openItem(item)}>
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  <time dateTime={item.createdAt}>{formatWhen(item.createdAt)}</time>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ):null}
    </div>
  )
}

function formatWhen(iso:string){
  if(!iso) return ''
  return new Date(iso).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
}
