"use client"
import {useEffect,useRef,type ReactNode} from 'react'
export default function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const d=ref.current;d?.showModal();return()=>{d?.close()}},[]);return <dialog ref={ref} className="modal-dialog" onCancel={e=>{e.preventDefault();close()}}><header><h2>{title}</h2><button aria-label="Close dialog" onClick={close}>×</button></header>{children}</dialog>}
