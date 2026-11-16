/** Shared (client + server) rules for product/inventory images and profile photos. */
export const UPLOAD_KINDS = ['inventory','products','avatars','test'] as const
export type UploadKind = typeof UPLOAD_KINDS[number]
/** Cloudinary folder per kind. Uploads are signed for exactly this folder. */
export const UPLOAD_FOLDERS: Record<UploadKind,string> = {
  inventory:'fabricut/inventory',
  products:'fabricut/products',
  avatars:'fabricut/avatars',
  test:'fabricut/test',
}
/** Kinds only the admin may upload. Any signed-in user may upload their own avatar. */
export const ADMIN_UPLOAD_KINDS: readonly UploadKind[] = ['inventory','products','test']
export const MAX_UPLOAD_BYTES = 5*1024*1024
export const ALLOWED_IMAGE_TYPES = ['image/jpeg','image/png','image/webp'] as const
export const ALLOWED_FORMATS = ['jpg','jpeg','png','webp'] as const

export function isUploadKind(value:unknown):value is UploadKind{
  return typeof value==='string'&&(UPLOAD_KINDS as readonly string[]).includes(value)
}

/** Browser-side check before anything is sent. Returns an error message or ''. */
export function imageFileError(file:{type:string;size:number}){
  if(!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Only JPEG, PNG or WebP images are allowed'
  if(file.size<=0) return 'The file is empty'
  if(file.size>MAX_UPLOAD_BYTES) return 'Image is larger than 5 MB'
  return ''
}

export type MediaView = 'photo' | 'pattern'
/** Cards show the photo by default; with no photo only the pattern is shown. */
export function defaultMediaView(imageUrl:string|null|undefined):MediaView{
  return imageUrl&&imageUrl.trim()?'photo':'pattern'
}
/** The Photo / Pattern toggle only appears when there is a photo to switch to. */
export function canToggleMedia(imageUrl:string|null|undefined){
  return defaultMediaView(imageUrl)==='photo'
}
/** Effective view: a requested 'photo' falls back to 'pattern' when there is no photo. */
export function resolveMediaView(imageUrl:string|null|undefined,requested?:MediaView):MediaView{
  if(!canToggleMedia(imageUrl)) return 'pattern'
  return requested||'photo'
}
