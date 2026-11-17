import {NextResponse,type NextRequest} from 'next/server'
import {SESSION_COOKIE,verifySession} from '@/lib/auth/session'
import {localControllerEnabled} from '@/lib/server/localController'

async function currentSession(req:NextRequest){
  const token=req.cookies.get(SESSION_COOKIE)?.value
  if(!token) return null
  try{return await verifySession(token)}catch{return null}
}

export async function middleware(req:NextRequest){
  const {pathname}=req.nextUrl
  const session=await currentSession(req)
  const login=new URL('/login',req.url)
  login.searchParams.set('next',pathname)

  // Machine controller pages are hidden unless enabled (localhost in dev, or LOCAL_CONTROLLER=on).
  if((pathname.startsWith('/admin/local-controller')||pathname.startsWith('/admin/control'))&&!localControllerEnabled(process.env,req.headers.get('host'))){
    return new NextResponse('Not found',{status:404,headers:{'Content-Type':'text/plain'}})
  }
  if(pathname.startsWith('/admin')){
    if(!session) return NextResponse.redirect(login)
    if(session.role!=='admin') return NextResponse.redirect(new URL('/shop',req.url))
    return NextResponse.next()
  }
  if(pathname.startsWith('/shop')||pathname.startsWith('/customer')){
    if(!session) return NextResponse.redirect(login)
    if(pathname.startsWith('/customer')) return NextResponse.redirect(new URL(pathname.replace(/^\/customer/,'/shop')||'/shop',req.url))
    return NextResponse.next()
  }
  if(pathname.startsWith('/dashboard')){
    if(!session) return NextResponse.redirect(login)
    if(session.role==='admin') return NextResponse.redirect(new URL('/admin',req.url))
    return NextResponse.redirect(new URL('/shop',req.url))
  }
  return NextResponse.next()
}

export const config={
  matcher:['/admin/:path*','/shop/:path*','/customer/:path*','/dashboard/:path*'],
}
