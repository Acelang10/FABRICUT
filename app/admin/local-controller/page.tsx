import {headers} from 'next/headers'
import {notFound} from 'next/navigation'
import {localControllerEnabled} from '@/lib/server/localController'
import LocalControllerView from '@/components/admin/LocalControllerView'

export const dynamic='force-dynamic'

export default async function Page(){
  // Local only: 404 on Vercel or any non-localhost host.
  if(!localControllerEnabled(process.env,(await headers()).get('host'))) notFound()
  return <LocalControllerView/>
}
