import {headers} from 'next/headers'
import AdminShell from '@/components/admin/AdminShell'
import {localControllerEnabled} from '@/lib/server/localController'

export default async function Layout({children}:{children:React.ReactNode}){
  const host=(await headers()).get('host')
  return <AdminShell localController={localControllerEnabled(process.env,host)}>{children}</AdminShell>
}
