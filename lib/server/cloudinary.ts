import {randomUUID} from 'node:crypto'
import {v2 as cloudinary} from 'cloudinary'
import {ALLOWED_FORMATS,MAX_UPLOAD_BYTES,UPLOAD_FOLDERS,type UploadKind} from '../media'

export interface CloudinaryCredentials {cloudName:string;apiKey:string;apiSecret:string}

/** Reads CLOUDINARY_URL (cloudinary://KEY:SECRET@CLOUD) or the three separate variables. Never logs values. */
export function cloudinaryCredentials(env:Record<string,string|undefined>=process.env):CloudinaryCredentials|null{
  const raw=(env.CLOUDINARY_URL||'').trim()
  if(raw){
    try{
      const url=new URL(raw)
      if(url.protocol!=='cloudinary:') return null
      const cloudName=url.hostname
      const apiKey=decodeURIComponent(url.username)
      const apiSecret=decodeURIComponent(url.password)
      if(cloudName&&apiKey&&apiSecret) return {cloudName,apiKey,apiSecret}
    }catch{ /* fall through */ }
    return null
  }
  const cloudName=(env.CLOUDINARY_CLOUD_NAME||'').trim()
  const apiKey=(env.CLOUDINARY_API_KEY||'').trim()
  const apiSecret=(env.CLOUDINARY_API_SECRET||'').trim()
  return cloudName&&apiKey&&apiSecret?{cloudName,apiKey,apiSecret}:null
}

/** Uploaded images are capped to 2000px on the longest side as Cloudinary stores them. */
const INCOMING='c_limit,h_2000,w_2000'

/** Filename prefix that ties an avatar to its owner; other kinds use a fixed prefix. */
export function ownerPrefix(kind:UploadKind,uid:string){
  if(kind!=='avatars') return 'img-'
  const safe=uid.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)||'user'
  return `${safe}-`
}

export interface SignedUpload {
  uploadUrl:string
  fields:Record<string,string>
  maxBytes:number
  folder:string
}

export function signUpload(creds:CloudinaryCredentials,kind:UploadKind,uid:string,now=Date.now()):SignedUpload{
  const folder=UPLOAD_FOLDERS[kind]
  const params:Record<string,string>={
    timestamp:String(Math.floor(now/1000)),
    folder,
    public_id:`${ownerPrefix(kind,uid)}${randomUUID()}`,
    allowed_formats:ALLOWED_FORMATS.join(','),
    transformation:INCOMING,
    overwrite:'false',
  }
  const signature=cloudinary.utils.api_sign_request(params,creds.apiSecret)
  return {
    uploadUrl:`https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/image/upload`,
    fields:{...params,api_key:creds.apiKey,signature},
    maxBytes:MAX_UPLOAD_BYTES,
    folder,
  }
}

/** Optimised delivery URL (f_auto,q_auto). Avatars are cropped to a 256px square around the face. */
export function deliveryUrl(cloudName:string,kind:UploadKind,publicId:string,version?:number|string){
  const transform=kind==='avatars'?'c_fill,g_face,h_256,w_256/f_auto,q_auto':'f_auto,q_auto'
  const v=version?`v${String(version).replace(/\D/g,'')}/`:''
  const path=publicId.split('/').map(encodeURIComponent).join('/')
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/${transform}/${v}${path}`
}

export interface UploadedResource {public_id:string;bytes:number;format:string;resource_type:string;version?:number}

export interface CloudinaryClient {
  resource(creds:CloudinaryCredentials,publicId:string):Promise<UploadedResource|null>
  destroy(creds:CloudinaryCredentials,publicId:string):Promise<void>
}

export const cloudinaryClient:CloudinaryClient={
  async resource(creds,publicId){
    try{
      const options={resource_type:'image',cloud_name:creds.cloudName,api_key:creds.apiKey,api_secret:creds.apiSecret}
      const r=await cloudinary.api.resource(publicId,options)
      return {public_id:r.public_id,bytes:Number(r.bytes),format:String(r.format),resource_type:String(r.resource_type),version:Number(r.version)}
    }catch{return null}
  },
  async destroy(creds,publicId){
    const options={resource_type:'image',invalidate:true,cloud_name:creds.cloudName,api_key:creds.apiKey,api_secret:creds.apiSecret}
    await cloudinary.uploader.destroy(publicId,options).catch(()=>{})
  },
}

/** Checks an upload the browser says it finished: right folder/owner, an allowed image type, ≤ 5 MB. */
export function uploadProblem(kind:UploadKind,uid:string,publicId:string,resource:UploadedResource|null){
  const prefix=`${UPLOAD_FOLDERS[kind]}/${ownerPrefix(kind,uid)}`
  if(!publicId.startsWith(prefix)||publicId.includes('..')) return {status:403,error:'That image does not belong to this upload'}
  if(!resource) return {status:404,error:'Upload not found'}
  if(resource.resource_type!=='image'||!(ALLOWED_FORMATS as readonly string[]).includes(resource.format)) return {status:415,error:'Only JPEG, PNG or WebP images are allowed'}
  if(resource.bytes>MAX_UPLOAD_BYTES) return {status:413,error:'Image is larger than 5 MB'}
  return null
}
