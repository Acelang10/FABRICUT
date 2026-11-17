import {headers} from 'next/headers'
import {notFound} from 'next/navigation'
import {localControllerEnabled,localControllerIsRemote} from '@/lib/server/localController'
import LocalControllerView from '@/components/admin/LocalControllerView'

export const dynamic='force-dynamic'

export default async function Page(){
  if(!localControllerEnabled(process.env,(await headers()).get('host'))) notFound()
  return <LocalControllerView remote={localControllerIsRemote()}/>
}
