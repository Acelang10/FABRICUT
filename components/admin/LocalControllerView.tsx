"use client"
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {api} from '@/lib/client/api'
import {StepperSerialClient,type SerialPortLike} from '@/lib/client/motor-serial.mjs'
import {STEP_SIZES,STEPS_PER_MM,X_LIMITS,isMotionCommand,validateXCommand,type XTelemetry} from '@/lib/controller/xcommands'

type Transport='usb'|'wifi'
interface BrowserSerial extends EventTarget {requestPort:()=>Promise<SerialPortLike>}
interface WifiResult {ok:boolean;telemetry:XTelemetry|null;error?:string}
interface LogLine {at:string;text:string;tone:'sent'|'dry'|'error'|'info'}

function serialApi(){return (navigator as Navigator&{serial?:BrowserSerial}).serial}
const time=()=>new Date().toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour12:false})

/**
 * Local-only machine controller for the ESP32 X-axis test firmware (Y + mirrored X1/X2, 28BYJ-48).
 * USB serial (Web Serial, protocol v3) or the ESP32 Wi-Fi AP via the local server proxy.
 * Dry run is ON by default: motion commands are only logged. STOP always goes out. No laser control.
 */
export default function LocalControllerView({remote=false}:{remote?:boolean}={}){
  const [transport,setTransport]=useState<Transport>('wifi')
  const [dryRun,setDryRun]=useState(true)
  const [connected,setConnected]=useState(false)
  const [telemetry,setTelemetry]=useState<XTelemetry|null>(null)
  const [linkError,setLinkError]=useState('')
  const [busy,setBusy]=useState(false)
  const [stepSize,setStepSize]=useState<number>(256)
  const [speed,setSpeed]=useState(300)
  const [testSteps,setTestSteps]=useState('512')
  const [testCycles,setTestCycles]=useState('2')
  const [log,setLog]=useState<LogLine[]>([])
  const [usbSupported,setUsbSupported]=useState(false)
  const usb=useRef<StepperSerialClient|null>(null)
  const poll=useRef<number|null>(null)
  const transportRef=useRef<Transport>('wifi')
  const connectedRef=useRef(false)

  const note=useCallback((text:string,tone:LogLine['tone']='info')=>{
    setLog(l=>[{at:time(),text,tone},...l].slice(0,30))
  },[])

  useEffect(()=>{setUsbSupported(!!serialApi()&&window.isSecureContext)},[])
  useEffect(()=>{transportRef.current=transport},[transport])
  useEffect(()=>{connectedRef.current=connected},[connected])

  const stopPolling=()=>{ if(poll.current!==null){ window.clearInterval(poll.current); poll.current=null } }

  const sendStop=useCallback(async(reason='STOP')=>{
    if(transportRef.current==='usb'){
      if(usb.current) await usb.current.stop().catch(()=>{})
    }else{
      try{
        const r=await api<WifiResult>('/local-controller/wifi/stop','POST')
        if(r.telemetry) setTelemetry(r.telemetry)
      }catch(e){ setLinkError(e instanceof Error?e.message:'STOP not confirmed') }
    }
    note(`${reason} sent`,'sent')
  },[note])

  // Leaving or hiding the page stops motion (the ESP32 dead-man also stops Wi-Fi moves after 2 s).
  useEffect(()=>{
    function hidden(){
      if(!document.hidden||!connectedRef.current) return
      if(transportRef.current==='wifi') void fetch('/api/local-controller/wifi/stop',{method:'POST',keepalive:true,credentials:'include'}).catch(()=>{})
      else void usb.current?.stop().catch(()=>{})
    }
    function leave(){ if(connectedRef.current&&transportRef.current==='wifi') navigator.sendBeacon?.('/api/local-controller/wifi/stop') }
    document.addEventListener('visibilitychange',hidden)
    window.addEventListener('pagehide',leave)
    return ()=>{
      document.removeEventListener('visibilitychange',hidden)
      window.removeEventListener('pagehide',leave)
      stopPolling()
      void usb.current?.disconnect().catch(()=>{})
    }
  },[])

  async function connect(){
    setBusy(true);setLinkError('')
    try{
      if(transport==='usb'){
        const serial=serialApi()
        if(!serial) throw new Error('USB needs desktop Chrome or Edge in a secure context (HTTPS or localhost).')
        const port=await serial.requestPort()
        const client=new StepperSerialClient(
          p=>{setTelemetry(p as unknown as XTelemetry);setLinkError('')},
          err=>{setLinkError(err.message);setConnected(false)},
        )
        await client.connect(port)
        usb.current=client
        note('USB connected (HELLO sent; motors disarmed)')
      }else{
        const first=await api<WifiResult>('/local-controller/wifi/status')
        if(!first.ok) throw new Error(first.error||'ESP32 not reachable')
        setTelemetry(first.telemetry)
        stopPolling()
        poll.current=window.setInterval(async()=>{
          try{
            const r=await api<WifiResult>('/local-controller/wifi/status')
            setTelemetry(r.telemetry);setLinkError(r.ok?'':(r.error||'Link lost'))
          }catch(e){ setLinkError(e instanceof Error?e.message:'Link lost') }
        },500)
        note('Wi-Fi link to ESP32 at 192.168.4.1 (status every 0.5 s)')
      }
      setConnected(true)
    }catch(e){
      setLinkError(e instanceof Error?e.message:'Could not connect')
    }finally{setBusy(false)}
  }

  async function disconnect(){
    setBusy(true)
    try{
      if(telemetry?.state==='moving') await sendStop('STOP (disconnect)')
      stopPolling()
      await usb.current?.disconnect().catch(()=>{})
      usb.current=null
      setConnected(false);setTelemetry(null)
      note('Disconnected')
    }finally{setBusy(false)}
  }

  async function run(line:string){
    let command:string
    try{ command=validateXCommand(line,transport==='usb'?'serial':'wifi') }
    catch(e){ note(e instanceof Error?e.message:'Invalid command','error'); return }
    if(dryRun&&isMotionCommand(command)){ note(`${command} — dry run, not sent`,'dry'); return }
    if(!connected){ note(`${command} — not connected`,'error'); return }
    setBusy(true)
    try{
      if(transport==='usb'){
        const client=usb.current
        if(!client) throw new Error('USB not connected')
        const status=command==='ARM'?await client.arm():await client.command(command)
        setTelemetry(status as unknown as XTelemetry)
      }else{
        const r=await api<WifiResult>('/local-controller/wifi/cmd','POST',{c:command})
        if(r.telemetry) setTelemetry(r.telemetry)
        if(!r.ok) throw new Error(r.error||'Command failed')
      }
      note(`${command} sent`,'sent')
    }catch(e){ note(`${command}: ${e instanceof Error?e.message:'failed'}`,'error') }
    finally{setBusy(false)}
  }

  const armed=!!telemetry?.armed
  const moving=telemetry?.state==='moving'||telemetry?.xtest==='running'
  const xmm=telemetry?.x_steps!==undefined?(telemetry.x_steps/STEPS_PER_MM).toFixed(2):telemetry?.x?.toFixed(2)

  return (
    <>
      <div className="atelier-hello">
        <div>
          <h1>Local Controller</h1>
          <p>X-axis test for the ESP32 cutter (X1 + X2 mirrored, Y stays off).{remote?' The Wi-Fi proxy on this live site cannot reach the machine.':' Only shown on this computer unless LOCAL_CONTROLLER=on.'}</p>
        </div>
        <Link href="/admin/control" className="atelier-btn atelier-btn-ghost atelier-btn-sm">Laser pattern cutter (advanced) →</Link>
      </div>

      {remote?(
        <p className="lc-remote-note" role="note">
          Live site can&apos;t reach the ESP32 directly. Connect to Fabricut-Controller Wi-Fi and open <a href="http://192.168.4.1">http://192.168.4.1</a>, or run locally.
        </p>
      ):null}

      <div className="lc-stop-bar">
        <button type="button" className="lc-stop" onClick={()=>void sendStop()} disabled={!connected}>STOP</button>
        <p>STOP de-energizes all coils and disarms. It is <b>not</b> an emergency stop: keep a hand near the motor 5V switch.</p>
      </div>

      <div className="lc-grid">
        <section className="atelier-tile lc-panel" aria-labelledby="lc-link">
          <h2 id="lc-link">Connection</h2>
          <div className="lc-seg" role="radiogroup" aria-label="Connection type">
            {(['wifi','usb'] as Transport[]).map(t=>(
              <button key={t} type="button" role="radio" aria-checked={transport===t} className={transport===t?'on':undefined} disabled={connected} onClick={()=>setTransport(t)}>
                {t==='wifi'?'Wi-Fi (192.168.4.1)':'USB serial'}
              </button>
            ))}
          </div>
          <p className="atelier-muted">
            {transport==='wifi'
              ?(remote
                ?'The live site cannot reach 192.168.4.1. Connect to the “Fabricut-Controller” Wi-Fi and open the ESP32 page, or run this site locally. Only X-test commands are allowed.'
                :'Join this Mac to the “Fabricut-Controller” Wi-Fi first. The local server relays commands to the ESP32; only X-test commands are allowed.')
              :usbSupported?'Plug the ESP32 into this computer. Chrome/Edge will ask which port to use.':'USB needs desktop Chrome or Edge in a secure context (HTTPS or localhost).'}
          </p>
          <div className="atelier-dialog-actions lc-left">
            <button type="button" className="atelier-btn atelier-btn-b" disabled={busy||connected||(transport==='usb'&&!usbSupported)} onClick={()=>void connect()}>Connect</button>
            <button type="button" className="atelier-btn atelier-btn-ghost" disabled={busy||!connected} onClick={()=>void disconnect()}>Disconnect</button>
          </div>
          <label className="atelier-check lc-dry"><input type="checkbox" checked={dryRun} onChange={e=>setDryRun(e.target.checked)}/> Dry run (log motion commands, don’t send them)</label>
          {linkError?<p className="atelier-error" role="alert">{linkError}</p>:null}
        </section>

        <section className="atelier-tile lc-panel" aria-labelledby="lc-status">
          <h2 id="lc-status">Live status</h2>
          <dl className="lc-status">
            <div><dt>Link</dt><dd>{connected?(linkError?'Problem':'Connected'):'Off'}</dd></div>
            <div><dt>Armed</dt><dd className={armed?'lc-hot':undefined}>{telemetry?(armed?`Yes${telemetry.arm_left_ms?` · ${Math.ceil(telemetry.arm_left_ms/1000)} s left`:''}`:'No'):'—'}</dd></div>
            <div><dt>Moving</dt><dd>{telemetry?(moving?`Yes${telemetry.xtest_legs_left?` · ${telemetry.xtest_legs_left} legs left`:''}`:'No'):'—'}</dd></div>
            <div><dt>X position</dt><dd>{telemetry?`${xmm??'?'} mm${telemetry.x_steps!==undefined?` (${telemetry.x_steps} steps)`:''}`:'—'}</dd></div>
            <div><dt>Speed</dt><dd>{telemetry?.xtest_sps?`${telemetry.xtest_sps} steps/s`:'—'}</dd></div>
            <div><dt>Flip X2 / X</dt><dd>{telemetry?`${telemetry.x2_invert?'on':'off'} / ${telemetry.x_invert?'on':'off'}`:'—'}</dd></div>
            <div><dt>Laser</dt><dd>{telemetry?.laser?telemetry.laser.toUpperCase():'—'} <small>(no laser control here)</small></dd></div>
            <div><dt>Last result</dt><dd>{telemetry?.reason||'—'}</dd></div>
          </dl>
        </section>

        <section className="atelier-tile lc-panel lc-wide" aria-labelledby="lc-x">
          <h2 id="lc-x">X axis (both X motors together)</h2>
          <div className="atelier-dialog-actions lc-left">
            <button type="button" className="atelier-btn atelier-btn-y" disabled={busy||!connected||moving} onClick={()=>void run('ARM')}>ARM</button>
            <button type="button" className="atelier-btn atelier-btn-ghost" disabled={busy||!connected} onClick={()=>void run('DISARM')}>DISARM</button>
            <button type="button" className="atelier-btn atelier-btn-ghost" disabled={busy||!connected} onClick={()=>void run('STATUS')}>Refresh status</button>
          </div>
          <p className="atelier-muted">{transport==='wifi'?'Wi-Fi ARM disarms itself after 30 s without a button press.':'USB ARM stays on while this page keeps talking to the board.'}</p>

          <div className="lc-row">
            <span className="lc-label">Step size</span>
            <div className="lc-seg" role="radiogroup" aria-label="Step size">
              {[...STEP_SIZES,256].sort((a,b)=>a-b).map(s=>(
                <button key={s} type="button" role="radio" aria-checked={stepSize===s} className={stepSize===s?'on':undefined} onClick={()=>setStepSize(s)}>
                  {s} <small>({(s/STEPS_PER_MM).toFixed(1)} mm)</small>
                </button>
              ))}
            </div>
          </div>
          <div className="lc-row">
            <label className="lc-label" htmlFor="lc-speed">Speed {speed} steps/s</label>
            <input id="lc-speed" type="range" min={X_LIMITS.minSps} max={X_LIMITS.maxSps} step={10} value={speed} onChange={e=>setSpeed(Number(e.target.value))}/>
            <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" disabled={busy||!connected||moving} onClick={()=>void run(`XSPEED ${speed}`)}>Set speed</button>
          </div>
          <div className="lc-jog">
            <button type="button" className="atelier-btn atelier-btn-b" disabled={busy||moving||(!dryRun&&(!connected||!armed))} onClick={()=>void run(`XBACK ${stepSize} ${speed}`)}>← X Back</button>
            <button type="button" className="atelier-btn atelier-btn-b" disabled={busy||moving||(!dryRun&&(!connected||!armed))} onClick={()=>void run(`XFWD ${stepSize} ${speed}`)}>X Fwd →</button>
          </div>
          <div className="lc-row">
            <label>Test steps<input type="number" min={1} max={X_LIMITS.maxSteps} value={testSteps} onChange={e=>setTestSteps(e.target.value)}/></label>
            <label>Cycles<input type="number" min={X_LIMITS.minCycles} max={X_LIMITS.maxCycles} value={testCycles} onChange={e=>setTestCycles(e.target.value)}/></label>
            <button type="button" className="atelier-btn atelier-btn-y" disabled={busy||moving||(!dryRun&&(!connected||!armed))} onClick={()=>void run(`XTEST ${testSteps} ${testCycles} ${speed}`)}>Run X test (back and forth)</button>
          </div>
          <div className="lc-row">
            <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" disabled={busy||!connected||moving} onClick={()=>void run('INVX2')} title="Use if the two X motors fight each other (buzz, gantry twists)">Flip X2</button>
            <button type="button" className="atelier-btn atelier-btn-ghost atelier-btn-sm" disabled={busy||!connected||moving} onClick={()=>void run('INVX')} title="Use if X Fwd moves the gantry the wrong way">Flip X</button>
            <span className="atelier-muted">Flips reset when the ESP32 restarts; save the right setting in FabricutConfig.h.</span>
          </div>
        </section>

        <section className="atelier-tile lc-panel lc-wide" aria-labelledby="lc-log">
          <h2 id="lc-log">Command log</h2>
          {log.length===0?<p className="atelier-muted">No commands yet.</p>:null}
          <ol className="lc-log">
            {log.map((l,i)=><li key={i} className={`lc-${l.tone}`}><time>{l.at}</time> {l.text}</li>)}
          </ol>
        </section>
      </div>
    </>
  )
}
