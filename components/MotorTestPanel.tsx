"use client"
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {api} from '@/lib/client/api'
import type {StaffUser} from '@/lib/types'
import {StepperSerialClient,type StepperStatus,type SerialPortLike} from '@/lib/client/motor-serial.mjs'
import PatternPlotter, {type SharedSerial} from './PatternPlotter'

interface BrowserSerial extends EventTarget {requestPort:()=>Promise<SerialPortLike>}
function serialApi(){return (navigator as Navigator & {serial?:BrowserSerial}).serial}

export default function MotorTestPanel(){
  const client=useRef<StepperSerialClient|null>(null)
  const [packet,setPacket]=useState<StepperStatus|null>(null)
  const [notice,setNotice]=useState('USB disconnected. No physical machine state is known.')
  const [busy,setBusy]=useState(false)
  const [supported,setSupported]=useState(false)
  const [linked,setLinked]=useState(false)
  const [jogMm,setJogMm]=useState('5')
  const [feed,setFeed]=useState('200')
  const [, bump]=useState(0)

  const assertStaff=useCallback(async()=>{
    const result=await api<{user:StaffUser}>('/auth/me')
    if(result.user.role!=='admin'&&result.user.role!=='owner'&&result.user.role!=='staff')
      throw new Error('Admin access is required for machine controls.')
  },[])

  useEffect(()=>{
    let active=true
    const instance=new StepperSerialClient(
      p=>{if(!active)return;setPacket(p);setLinked(true);setNotice(`MCU: ${p.state} / ${p.reason} @ (${p.x.toFixed(2)},${p.y.toFixed(2)}) · laser ${p.laser.toUpperCase()}`)},
      error=>{if(!active)return;setPacket(null);setLinked(false);setNotice(error.message)}
    )
    client.current=instance
    bump(n=>n+1)
    setSupported(!!serialApi()&&window.isSecureContext)
    const stopBestEffort=()=>{void instance.stop().catch(()=>{})}
    const visibility=()=>{if(document.hidden)stopBestEffort()}
    const lost=()=>{setLinked(false);setPacket(null);setNotice('USB disconnected: physical state UNKNOWN. Use independent E-stop if needed.');void instance.disconnect(false)}
    window.addEventListener('pagehide',stopBestEffort)
    document.addEventListener('visibilitychange',visibility)
    serialApi()?.addEventListener('disconnect',lost)
    const permissionTimer=window.setInterval(()=>{
      if(instance.ready) void assertStaff().catch(error=>{
        setNotice(error instanceof Error?error.message:'Staff authorization unavailable')
        setLinked(false);setPacket(null);void instance.disconnect()
      })
    },5000)
    return()=>{
      active=false
      window.clearInterval(permissionTimer)
      window.removeEventListener('pagehide',stopBestEffort)
      document.removeEventListener('visibilitychange',visibility)
      serialApi()?.removeEventListener('disconnect',lost)
      void instance.disconnect()
      client.current=null
    }
  },[assertStaff])

  async function action(run:()=>Promise<unknown>){
    setBusy(true)
    try{await run()}
    catch(error){setNotice(error instanceof Error?error.message:'Request failed — physical state unknown')}
    finally{setBusy(false)}
  }

  async function connect(){
    const serial=serialApi()
    if(!serial) throw new Error('Use desktop Chrome or Edge on localhost/HTTPS.')
    const selected=await serial.requestPort()
    await assertStaff()
    await client.current!.connect(selected)
  }

  async function disconnect(){
    await client.current?.disconnect()
    setLinked(false);setPacket(null)
    setNotice('USB closed.')
  }

  const ready=linked&&!!client.current?.ready
  const canJog=ready&&!busy&&!!packet?.armed&&packet.state==='idle'
  const laserOn=packet?.laser==='on'
  const shared:SharedSerial=useMemo(()=>({
    getClient:()=>client.current,
    ready,
    packet,
    assertStaff,
  }),[ready,packet,assertStaff,linked])

  return <>
    <section className="card" aria-labelledby="stepper-title">
      <h2 id="stepper-title">USB laser cutter — X / Y steppers (28BYJ-48) + laser relay</h2>
      <div className="notice" role="alert" style={{background:'#fde8e8',border:'2px solid #b52035',color:'#5c0b16',padding:'0.75rem',borderRadius:8}}>
        <strong>⚠ LASER DANGER — eye and fire hazard.</strong>
        <ul style={{margin:'0.4rem 0 0 1.2rem'}}>
          <li>Everyone in the room must wear laser safety goggles rated for the laser wavelength (usually 445 nm, OD4+). Normal glasses and sunglasses do NOT protect; reflections can blind.</li>
          <li>Fabric can ignite. Never leave the machine running unattended; keep a fire extinguisher nearby and ventilate the smoke.</li>
          <li>Keep a physical switch on the laser 12V supply within reach. Software STOP is not an E-stop.</li>
        </ul>
      </div>
      <p className="notice"><strong>{!packet?'NO DEVICE TELEMETRY':`LASER ${packet.laser.toUpperCase()}${packet.laser_latched?' (M3 enabled)':''} · coils ${packet.coils||'?'} · relay GPIO${packet.laser_pin??26} · work ~${packet.x_max||444.5}×${packet.y_max||650} mm`}</strong><br/>
      Protocol v3 (F2). The laser relay only closes during G1 cutting moves after M3, and turns off on G0 travel, M5, STOP, errors and USB loss. Relay ON/OFF only — no power (PWM) control. Soft limits are uncalibrated. Keep the 5V motor PSU and laser 12V supply off while flashing.</p>
      {!supported?<p role="alert">Web Serial requires desktop Chrome/Edge on localhost or HTTPS. No backend opens a serial port.</p>:null}
      <div className="actions">
        <button className="btn btn-primary" disabled={!supported||ready||busy} onClick={()=>void action(connect)}>Connect USB</button>
        <button className="btn" disabled={!ready||busy} onClick={()=>void action(disconnect)}>Disconnect</button>
        <button className="btn" disabled={!ready||busy||!!packet?.armed||packet?.state!=='idle'} onClick={()=>void action(async()=>{await assertStaff();await client.current!.arm()})}>Arm</button>
        <button className="btn" style={{background:'#b52035',color:'#fff'}} disabled={!linked} onClick={()=>void action(()=>client.current!.stop())}>STOP</button>
        <button className="btn" disabled={!ready||busy} onClick={()=>void action(async()=>{await assertStaff();await client.current!.setOrigin()})}>Set origin</button>
      </div>
      <div className="actions">
        <label>Jog mm <input type="number" step="0.1" value={jogMm} onChange={e=>setJogMm(e.target.value)}/></label>
        <label>Feed <input type="number" step="1" value={feed} onChange={e=>setFeed(e.target.value)}/></label>
        {([['Y',1,'Y+'],['Y',-1,'Y-'],['X',1,'X+'],['X',-1,'X-']] as const).map(([axis,sign,label])=>
          <button key={label} className="btn" disabled={!canJog} onClick={()=>void action(async()=>{
            await assertStaff()
            await client.current!.jog(axis, Number(jogMm)*sign, Number(feed))
          })}>{label}</button>
        )}
        <button className="btn" disabled={!canJog} title="M3: enables the laser; the relay closes only during G1 cutting moves" onClick={()=>void action(async()=>{
          await assertStaff()
          if(!window.confirm('Enable the LASER (M3)? Everyone must be wearing laser safety goggles, and the fabric must be supervised.')) return
          await client.current!.laserOn()
        })}>Laser ON (M3)</button>
        <button className="btn" disabled={!linked} onClick={()=>void action(()=>client.current!.laserOff())}>Laser OFF (M5)</button>
      </div>
      <p role="status">{notice}</p>
      <div className="stats-grid">
        <div><strong>Pose (mm)</strong><p>{packet?`${packet.x.toFixed(2)}, ${packet.y.toFixed(2)}`:'Unknown'}</p></div>
        <div><strong>Laser</strong><p style={laserOn?{color:'#b52035',fontWeight:700}:undefined}>{packet?`${packet.laser.toUpperCase()}${packet.laser_latched?' · M3 enabled':''}`:'Unknown'}</p></div>
        <div><strong>State</strong><p>{packet?`${packet.state} / armed=${packet.armed}`:'Unknown'}</p></div>
        <div><strong>Reason</strong><p>{packet?.reason||'—'}</p></div>
        <div><strong>Feed</strong><p>{packet?.feed??feed}</p></div>
      </div>
    </section>
    <PatternPlotter serial={shared} feed={Number(feed)||200}/>
  </>
}
