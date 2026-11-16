/** Letter shown in the avatar badge when there is no profile photo. Admin always shows "A". */
export function avatarInitial(user:{role?:string;name?:string|null;email?:string|null}|null|undefined){
  if(!user) return '?'
  if(user.role==='admin') return 'A'
  const source=(user.name||'').trim()||(user.email||'').trim()
  const letter=[...source].find(ch=>/\p{L}|\p{N}/u.test(ch))
  return letter?letter.toLocaleUpperCase():'?'
}

/** Name shown at the top of the menu: display name, else the part of the email before @. */
export function displayName(user:{role?:string;name?:string|null;email?:string|null}|null|undefined){
  if(!user) return ''
  if(user.role==='admin') return (user.name&&user.name!=='admin')?user.name:'Admin'
  const name=(user.name||'').trim()
  if(name) return name
  return (user.email||'').split('@')[0]||'Customer'
}

/** Avatar photo order: saved profile photo, then Google photo, then none (initial is shown). */
export function pickAvatarPhoto(profilePhoto:string|null|undefined,googlePhoto:string|null|undefined){
  return safePhotoUrl(profilePhoto)||safePhotoUrl(googlePhoto)
}

/** Only https Google/Firebase profile photos are shown. */
export function safePhotoUrl(url:string|null|undefined){
  if(!url) return ''
  try{
    const u=new URL(url)
    return u.protocol==='https:'?u.toString():''
  }catch{return ''}
}
