async function optionalAuthHeaders():Promise<Record<string,string>>{
  try{
    const {firebaseAuth}=await import('./firebase')
    const auth=await firebaseAuth()
    if(auth.currentUser) return {Authorization:`Bearer ${await auth.currentUser.getIdToken()}`}
  }catch{ /* cookie session may still be valid */ }
  return {}
}

export async function api<T>(url:string,method='GET',data?:unknown):Promise<T>{
  const headers:Record<string,string>={...await optionalAuthHeaders()}
  let body:BodyInit|undefined
  if(data instanceof FormData) body=data
  else if(data!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(data)}
  const r=await fetch(`/api${url}`,{method,headers,body,cache:'no-store',credentials:'include'})
  const result=await r.json().catch(()=>({} as {error?:string}))
  if(!r.ok) throw new Error(result.error||'Request failed')
  return result as T
}

export async function privateImage(url:string){
  const target=new URL(url,window.location.origin)
  if(target.origin!==window.location.origin||!/^\/(uploads|api\/pattern-files)\//.test(target.pathname)) throw new Error('Untrusted asset URL')
  const r=await fetch(target,{headers:await optionalAuthHeaders(),cache:'no-store',credentials:'include'})
  if(!r.ok) throw new Error('Private image unavailable')
  return URL.createObjectURL(await r.blob())
}

export async function adminLogin(username:string,password:string){
  const r=await fetch('/api/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password}),cache:'no-store',credentials:'include'})
  const result=await r.json().catch(()=>({} as {error?:string}))
  if(!r.ok) throw new Error(result.error||'Sign-in failed')
  return result as {user:{uid:string;email:string;role:'admin'}}
}

export async function signOutSession(){
  await fetch('/api/auth/logout',{method:'POST',credentials:'include',cache:'no-store'}).catch(()=>{})
}
