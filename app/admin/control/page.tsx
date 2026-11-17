import Link from 'next/link'
import {headers} from 'next/headers'
import {notFound} from 'next/navigation'
import Controller from '@/components/Controller'
import {localControllerEnabled} from '@/lib/server/localController'

export const dynamic='force-dynamic'

export default async function Page(){
  // Hidden unless the Local Controller is enabled (localhost in dev, or LOCAL_CONTROLLER=on).
  if(!localControllerEnabled(process.env,(await headers()).get('host'))) notFound()
  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>Laser pattern cutter (advanced)</h1>
          <p>Previous USB laser controller. Connect from this page only; the dashboard never auto-connects or arms the machine.</p>
        </div>
        <Link href="/admin/local-controller" className="atelier-btn atelier-btn-ghost">← Local Controller</Link>
      </div>
      <div className="atelier-control-wrap">
        <Controller/>
      </div>
    </>
  )
}
