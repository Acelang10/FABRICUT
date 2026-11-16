"use client"
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {authErrorMessage,completeGoogleRedirect,emailPasswordReset,emailSignIn,emailSignUp,firebaseAuth,googleLogin,logout,requestEmailVerification} from '@/lib/client/firebase'
import {adminLogin,api} from '@/lib/client/api'
import type {AppUser} from '@/lib/types'

function GoogleIcon(){
  return (
    <svg className="signin-google-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function EyeIcon({open}:{open:boolean}){
  return open?(
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6z"/>
      <circle cx="12" cy="12" r="2.5"/>
    </svg>
  ):(
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6z"/>
      <circle cx="12" cy="12" r="2.5"/>
      <path d="M4 20L20 4"/>
    </svg>
  )
}

function DashboardPreview(){
  return (
    <div className="signin-preview" aria-hidden="true">
      <div className="signin-preview-bar">
        <span className="signin-preview-dots"><i/><i/><i/></span>
        <strong>Fabricut</strong>
        <em>Dashboard</em>
      </div>
      <div className="signin-preview-stats">
        <div><span>Clients</span><strong>24</strong></div>
        <div><span>Orders</span><strong>12</strong></div>
        <div><span>Cuts</span><strong>8</strong></div>
      </div>
      <div className="signin-preview-row">
        <div className="signin-preview-chart">
          <div className="signin-bars">
            <span style={{height:'38%'}}/>
            <span style={{height:'62%'}}/>
            <span style={{height:'48%'}}/>
            <span style={{height:'80%'}}/>
            <span style={{height:'56%'}}/>
            <span style={{height:'72%'}}/>
          </div>
          <p>Weekly cuts</p>
        </div>
        <div className="signin-preview-status">
          <strong><span className="signin-pulse"/> Laser ready</strong>
          <p>Gantry parked · Relay off</p>
        </div>
      </div>
      <ul className="signin-preview-list">
        <li><span>Barong pattern</span><b>70%</b></li>
        <li><span>Suit lining cut</span><b>45%</b></li>
        <li><span>Fitting scrap test</span><b>90%</b></li>
      </ul>
    </div>
  )
}

export default function Login(){
  const [gate,setGate]=useState<'customer'|'admin'>('customer')
  const [mode,setMode]=useState<'signin'|'signup'>('signin')
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [agreed,setAgreed]=useState(false)
  const [showPassword,setShowPassword]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const router=useRouter()

  useEffect(()=>{
    let cancelled=false
    void (async()=>{
      try{
        const result=await completeGoogleRedirect()
        if(cancelled||!result) return
        await enterCustomer()
      }catch(e){
        if(cancelled) return
        await logout().catch(()=>{})
        setError(authErrorMessage(e))
      }
    })()
    return ()=>{cancelled=true}
  },[])

  function goTo(role:'admin'|'customer'){
    router.replace(role==='admin'?'/admin':'/shop')
    router.refresh()
  }

  async function enterCustomer(){
    const auth=await firebaseAuth()
    const user=auth.currentUser
    if(!user)throw new Error('Sign-in failed')
    if(!user.emailVerified){
      await requestEmailVerification().catch(()=>{})
      throw new Error('Please verify your email before signing in. We sent a verification link to your inbox.')
    }
    await api<{user:AppUser}>('/auth/session')
    goTo('customer')
  }

  async function enterAdmin(user:string,pass:string){
    await adminLogin(user,pass)
    goTo('admin')
  }

  async function withAuthAction(action:()=>Promise<void>,logoutOnError=true){
    setBusy(true)
    setError('')
    setNotice('')
    try{
      await action()
    }catch(e){
      if(logoutOnError)await logout().catch(()=>{})
      setError(authErrorMessage(e))
    }finally{
      setBusy(false)
    }
  }

  async function loginWithGoogle(){
    await withAuthAction(async()=>{
      await googleLogin()
      await enterCustomer()
    })
  }

  async function submit(e:React.FormEvent){
    e.preventDefault()
    if(gate==='admin'){
      await withAuthAction(async()=>{
        await enterAdmin(username.trim()||email.trim(),password)
      },false)
      return
    }
    if(mode==='signin' && email.trim() && !email.includes('@')){
      await withAuthAction(async()=>{
        await enterAdmin(email.trim(),password)
      },false)
      return
    }
    if(mode==='signup'){
      if(!name.trim()){setError('Please enter your name.');return}
      if(!agreed){setError('Please agree to the Terms & Privacy to create an account.');return}
      await withAuthAction(async()=>{
        await emailSignUp(email.trim(),password,name)
        await logout().catch(()=>{})
        setNotice('Account created. Check your inbox for a verification link, then sign in.')
        setMode('signin')
        setPassword('')
        setAgreed(false)
      })
      return
    }
    await withAuthAction(async()=>{
      await emailSignIn(email.trim(),password)
      await enterCustomer()
    })
  }

  async function forgotPassword(){
    if(!email.trim()||!email.includes('@')){setError('Enter your email address to reset your password.');setNotice('');return}
    await withAuthAction(async()=>{
      await emailPasswordReset(email.trim())
      setNotice('If an account exists for that email, a password reset link has been sent.')
    },false)
  }

  function switchMode(next:'signin'|'signup'){
    setMode(next)
    setError('')
    setNotice('')
    setAgreed(false)
    setShowPassword(false)
  }

  function switchGate(next:'customer'|'admin'){
    setGate(next)
    setMode('signin')
    setError('')
    setNotice('')
    setShowPassword(false)
  }

  const admin=gate==='admin'

  return (
    <main className="signin-page">
      <div className="signin-wrap">
      <Link href="/" className="signin-back" aria-label="Back to home">← Back</Link>
      <section className="signin-shell">
        <div className="signin-left">
          <div className="signin-brand">
            <Image src="/logo.jpg" alt="JCM Tailoring" width={40} height={40} className="signin-logo"/>
            <span>FABRI<em>CUT</em></span>
          </div>
          <h1>Get Started Now</h1>
          <p className="signin-lead">
            {admin
              ? 'Workshop admin sign-in. This account is not created through sign-up.'
              : 'Customers can sign up or sign in with Google or email. Admin uses the workshop account.'}
          </p>
          <div className="signin-role" role="tablist" aria-label="Sign-in type">
            <button type="button" role="tab" aria-selected={!admin} className={!admin?'on':undefined} disabled={busy} onClick={()=>switchGate('customer')}>Customer</button>
            <button type="button" role="tab" aria-selected={admin} className={admin?'on':undefined} disabled={busy} onClick={()=>switchGate('admin')}>Admin</button>
          </div>
          {!admin?(
            <button type="button" className="signin-google" disabled={busy} onClick={()=>void loginWithGoogle()}>
              <GoogleIcon/>
              {busy?'Signing in…':'Log in with Google'}
            </button>
          ):null}
          {!admin?<div className="signin-divider"><span>or</span></div>:null}
          <form className="signin-form" onSubmit={e=>void submit(e)}>
            {!admin&&mode==='signup'?(
              <label className="signin-field">Name
                <input name="name" autoComplete="name" maxLength={80} value={name} onChange={e=>setName(e.target.value)} required/>
              </label>
            ):null}
            {admin?(
              <label className="signin-field">Username
                <input name="username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/>
              </label>
            ):(
              <label className="signin-field">Email
                <input type={mode==='signin'?'text':'email'} name="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
              </label>
            )}
            <label className="signin-field">Password
              <span className="signin-password">
                <input type={showPassword?'text':'password'} name="password" autoComplete={admin||mode==='signin'?'current-password':'new-password'} minLength={admin?1:6} value={password} onChange={e=>setPassword(e.target.value)} required/>
                <button type="button" className="signin-eye" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(v=>!v)}>
                  <EyeIcon open={!showPassword}/>
                </button>
              </span>
            </label>
            {!admin&&mode==='signin'?(
              <button type="button" className="signin-forgot" disabled={busy} onClick={()=>void forgotPassword()}>Forgot password?</button>
            ):null}
            {!admin&&mode==='signup'?(
              <label className="signin-terms">
                <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>
                <span>I agree to the Terms &amp; Privacy</span>
              </label>
            ):null}
            <button type="submit" className="signin-submit" disabled={busy}>
              {busy?(admin||mode==='signin'?'Signing in…':'Creating account…'):(admin||mode==='signin'?'Sign in':'Create account')}
            </button>
          </form>
          {error?<p role="alert" className="error signin-error">{error}</p>:null}
          {notice?<p role="status" className="signin-success">{notice}</p>:null}
          <p className="signin-note">
            {admin
              ? 'Admin access is limited to the single workshop account configured on the server. Customers create their own accounts on the Customer tab.'
              : 'Email accounts must be verified before you can open the shop. After sign-in you can browse products, fill a cart, and track your orders.'}
          </p>
          {!admin?(
            <p className="signin-switch">
              {mode==='signup'?(<>Have an account? <button type="button" disabled={busy} onClick={()=>switchMode('signin')}>Sign in</button></>):(<>Need an account? <button type="button" disabled={busy} onClick={()=>switchMode('signup')}>Create account</button></>)}
            </p>
          ):null}
          <div className="signin-footer">
            <p>© 2026 Fabricut</p>
          </div>
        </div>
        <aside className="signin-right">
          <h2>The simplest way to run your laser cutter</h2>
          <p>Plan patterns, drive the gantry, and keep tailoring work together in one place.</p>
          <DashboardPreview/>
          <div className="signin-mark">FABRICUT</div>
        </aside>
      </section>
      </div>
    </main>
  )
}
