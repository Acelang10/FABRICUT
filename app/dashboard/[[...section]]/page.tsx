import {redirect} from 'next/navigation'
import {cookies} from 'next/headers'
import {SESSION_COOKIE,verifySession} from '@/lib/auth/session'

export default async function Page(){
  const token=(await cookies()).get(SESSION_COOKIE)?.value
  const session=token?await verifySession(token):null
  if(!session) redirect('/login')
  if(session.role==='admin') redirect('/admin')
  redirect('/shop')
}
