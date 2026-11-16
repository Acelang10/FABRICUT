"use client"
import {useEffect,useId,useRef,useState} from 'react'
import {uploadImage,uploadsConfigured} from '@/lib/client/upload'
import {ALLOWED_IMAGE_TYPES,type UploadKind} from '@/lib/media'

/** Image picker: upload to Cloudinary (when configured) with preview, plus a manual link field. */
export default function ImageUpload({kind,value,onChange,label='Image',round=false,showUrlField=true}:{
  kind:UploadKind;value:string;onChange:(url:string)=>void;label?:string;round?:boolean;showUrlField?:boolean
}){
  const [ready,setReady]=useState<boolean|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [broken,setBroken]=useState(false)
  const input=useRef<HTMLInputElement>(null)
  const id=useId()

  useEffect(()=>{let live=true;uploadsConfigured().then(ok=>{if(live)setReady(ok)});return ()=>{live=false}},[])
  useEffect(()=>{setBroken(false)},[value])

  async function pick(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]
    e.target.value=''
    if(!file) return
    setBusy(true);setError('')
    try{ onChange(await uploadImage(kind,file)) }
    catch(err){ setError(err instanceof Error?err.message:'Upload failed') }
    finally{ setBusy(false) }
  }

  return (
    <fieldset className="image-upload">
      <legend>{label}</legend>
      <div className="image-upload-row">
        <div className={`image-upload-preview${round?' round':''}`} aria-live="polite">
          {value&&!broken
            // eslint-disable-next-line @next/next/no-img-element
            ?<img src={value} alt={`${label} preview`} referrerPolicy="no-referrer" onError={()=>setBroken(true)}/>
            :<span>{broken?'Preview unavailable':'No image'}</span>}
        </div>
        <div className="image-upload-actions">
          {ready?(
            <>
              <input ref={input} id={id} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} hidden onChange={e=>void pick(e)}/>
              <button type="button" className="atelier-btn atelier-btn-b atelier-btn-sm" disabled={busy} onClick={()=>input.current?.click()}>
                {busy?'Uploading…':value?'Replace photo':'Upload photo'}
              </button>
              <span className="atelier-muted">JPEG, PNG or WebP · up to 5 MB</span>
            </>
          ):ready===false?(
            <p className="atelier-muted image-upload-off" role="note">Image upload not configured. Paste an image link instead.</p>
          ):<span className="atelier-muted">Checking uploads…</span>}
          {value?<button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" disabled={busy} onClick={()=>onChange('')}>Remove</button>:null}
        </div>
      </div>
      {showUrlField?(
        <label>Image link (optional)
          <input value={value} onChange={e=>onChange(e.target.value)} placeholder="https://…" maxLength={500}/>
        </label>
      ):null}
      {error?<p className="atelier-error" role="alert">{error}</p>:null}
    </fieldset>
  )
}
