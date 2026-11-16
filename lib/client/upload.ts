import {api} from './api'
import {imageFileError,type UploadKind} from '../media'

let configured:Promise<boolean>|undefined
/** Whether the server has Cloudinary credentials (cached per page load). */
export function uploadsConfigured(){
  if(!configured) configured=api<{configured:boolean}>('/uploads/config').then(r=>r.configured).catch(()=>false)
  return configured
}

interface SignResponse {uploadUrl:string;fields:Record<string,string>}

/**
 * Signed direct upload: the server signs (folder, id, formats), the browser posts the file straight
 * to Cloudinary, then the server checks the stored file and returns the optimised delivery URL.
 */
export async function uploadImage(kind:UploadKind,file:File):Promise<string>{
  const problem=imageFileError(file)
  if(problem) throw new Error(problem)
  const signed=await api<SignResponse>('/uploads/sign','POST',{kind})
  const form=new FormData()
  for(const [key,value] of Object.entries(signed.fields)) form.append(key,value)
  form.append('file',file)
  const r=await fetch(signed.uploadUrl,{method:'POST',body:form})
  const result=await r.json().catch(()=>({})) as {public_id?:string;error?:{message?:string}}
  if(!r.ok||!result.public_id) throw new Error(result.error?.message||'Upload failed')
  const confirmed=await api<{url:string}>('/uploads/confirm','POST',{kind,publicId:result.public_id})
  return confirmed.url
}
