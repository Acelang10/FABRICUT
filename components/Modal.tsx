"use client"
import {useEffect,useRef,type ReactNode} from 'react'

export default function Modal({title,close,children,wide}:{title:string;close:()=>void;children:ReactNode;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const dialog=ref.current
    if(!dialog) return
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null
    dialog.showModal()
    const focusable=dialog.querySelector<HTMLElement>('input,select,textarea,button:not([aria-label="Close dialog"])')
    focusable?.focus()
    return ()=>{
      dialog.close()
      previous?.focus()
    }
  },[])
  return (
    <dialog ref={ref} className={`modal-dialog${wide?' modal-dialog-wide':''}`} onCancel={e=>{e.preventDefault();close()}}>
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="Close dialog" onClick={close}>×</button>
      </header>
      {children}
    </dialog>
  )
}
