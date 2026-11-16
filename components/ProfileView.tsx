"use client"
import {useEffect,useState} from 'react'
import {api} from '@/lib/client/api'
import {announceProfile} from '@/lib/client/profile'
import type {AppUser,UserProfile} from '@/lib/types'
import ImageUpload from './ImageUpload'

type Form = Omit<UserProfile,'id'|'updatedAt'>
const blank:Form={displayName:'',phone:'',address:'',birthday:'',photoUrl:''}

/** Edit your own photo and personal information. The server only ever saves the signed-in user's profile. */
export default function ProfileView({tone}:{tone:'admin'|'shop'}){
  const [user,setUser]=useState<AppUser|null>(null)
  const [form,setForm]=useState<Form>(blank)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  useEffect(()=>{
    Promise.all([api<{user:AppUser}>('/auth/me'),api<UserProfile>('/profile')])
      .then(([me,profile])=>{
        setUser(me.user)
        setForm({displayName:profile.displayName,phone:profile.phone,address:profile.address,birthday:profile.birthday,photoUrl:profile.photoUrl})
      })
      .catch(e=>setError(e instanceof Error?e.message:'Profile unavailable'))
      .finally(()=>setLoading(false))
  },[])

  async function save(next:Form,message='Profile saved'){
    setBusy(true);setError('');setNotice('')
    try{
      const saved=await api<UserProfile>('/profile','PUT',{
        displayName:next.displayName.trim(),phone:next.phone.trim(),address:next.address.trim(),birthday:next.birthday,photoUrl:next.photoUrl.trim(),
      })
      setForm({displayName:saved.displayName,phone:saved.phone,address:saved.address,birthday:saved.birthday,photoUrl:saved.photoUrl})
      announceProfile(saved)
      setNotice(message)
    }catch(err){setError(err instanceof Error?err.message:'Could not save profile')}
    finally{setBusy(false)}
  }

  const today=new Date().toISOString().slice(0,10)
  if(loading) return <p role="status">Loading profile…</p>

  return (
    <section className={`profile-page profile-${tone}`} aria-labelledby="profile-title">
      <div className="atelier-hello">
        <div>
          <h1 id="profile-title">Profile</h1>
          <p>{tone==='admin'?'Your administrator photo and details.':'Your photo and personal information. Only you can see and change this.'}</p>
        </div>
      </div>
      <form className="profile-card" onSubmit={e=>{e.preventDefault();void save(form)}}>
        <ImageUpload kind="avatars" label="Profile photo" round value={form.photoUrl}
          onChange={url=>{const next={...form,photoUrl:url};setForm(next);void save(next,url?'Photo updated':'Photo removed')}}/>
        {tone==='shop'&&!form.photoUrl?<p className="atelier-muted">With no photo here, your Google photo (or your initial) is used.</p>:null}
        <label>Email<input value={user?.role==='admin'?'Administrator':(user?.email||'')} readOnly aria-readonly="true"/></label>
        <label>Display name<input value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} maxLength={80} autoComplete="name"/></label>
        <div className="atelier-form-row">
          <label>Phone<input type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} maxLength={30} autoComplete="tel" placeholder="+63 9xx xxx xxxx"/></label>
          <label>Birthday (optional)<input type="date" value={form.birthday} max={today} min="1900-01-01" onChange={e=>setForm({...form,birthday:e.target.value})} autoComplete="bday"/></label>
        </div>
        <label>Address<textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})} maxLength={300} rows={3} autoComplete="street-address"/></label>
        {error?<p className="atelier-error" role="alert">{error}</p>:null}
        {notice?<p className="atelier-success" role="status">{notice}</p>:null}
        <div className="atelier-dialog-actions">
          <button type="submit" className="atelier-btn atelier-btn-b" disabled={busy}>{busy?'Saving…':'Save profile'}</button>
        </div>
      </form>
    </section>
  )
}
