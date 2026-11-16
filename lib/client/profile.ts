import {useEffect,useState} from 'react'
import {api} from './api'
import type {UserProfile} from '../types'

export const PROFILE_EVENT='fabricut-profile'

/** Tell the top bar (avatar + name) that the profile changed. */
export function announceProfile(profile:UserProfile){
  window.dispatchEvent(new CustomEvent<UserProfile>(PROFILE_EVENT,{detail:profile}))
}

/** Current user's own profile; refreshes when the Profile page saves. */
export function useOwnProfile(enabled:boolean){
  const [profile,setProfile]=useState<UserProfile|null>(null)
  useEffect(()=>{
    if(!enabled) return
    let live=true
    api<UserProfile>('/profile').then(p=>{if(live)setProfile(p)}).catch(()=>{})
    function onChange(e:Event){ setProfile((e as CustomEvent<UserProfile>).detail) }
    window.addEventListener(PROFILE_EVENT,onChange)
    return ()=>{live=false;window.removeEventListener(PROFILE_EVENT,onChange)}
  },[enabled])
  return profile
}
