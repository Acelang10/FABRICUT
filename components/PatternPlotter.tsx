"use client"
import {useEffect,useMemo,useRef,useState} from 'react'
import {api,privateImage} from '@/lib/client/api'
import type {StepperSerialClient,StepperStatus} from '@/lib/client/motor-serial.mjs'
import {
  defaultFitOptions,fitToWork,svgToPolylines,
  rasterToPolylines,polylinesToGcode,pathStats,maxSizeForLimit,machineWorkBox,workBoxOf,
  type FitOptions,type Polylines,type WorkBox,
} from '@/lib/client/toolpath'

function clampSize(f:FitOptions,key:'targetWidthMm'|'targetHeightMm',value:number):FitOptions{
  const max=maxSizeForLimit(workBoxOf(f),f.marginMm)
  const cap=key==='targetWidthMm'?max.targetWidthMm:max.targetHeightMm
  const n=Number.isFinite(value)?Math.min(cap,Math.max(1,value)):cap
  return {...f,[key]:Math.round(n*10)/10}
}

export type SharedSerial = {
  getClient:()=>StepperSerialClient|null
  ready:boolean
  packet:StepperStatus|null
  assertStaff:()=>Promise<void>
}

export default function PatternPlotter({serial,feed}:{serial:SharedSerial;feed:number}){
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const fileRef=useRef<HTMLInputElement>(null)
  const [raw,setRaw]=useState<Polylines>([])
  const [fit,setFit]=useState<FitOptions>(defaultFitOptions())
  const [gcode,setGcode]=useState<string[]>([])
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('Upload SVG (preferred) or PNG/JPG to build a toolpath.')
  const [progress,setProgress]=useState(0)
  const [streaming,setStreaming]=useState(false)
  const [paused,setPaused]=useState(false)
  const pauseRef=useRef(false)
  const [threshold,setThreshold]=useState(128)
  const [busy,setBusy]=useState(false)
  const [savedName,setSavedName]=useState<string|null>(null)
  const [safetyAck,setSafetyAck]=useState(false)

  const limitKey=serial.packet?.soft_limit
    ? `${serial.packet.x_min},${serial.packet.x_max},${serial.packet.y_min},${serial.packet.y_max}`
    : 'bed'

  useEffect(()=>{
    const parts=limitKey.split(',').map(Number)
    const box:WorkBox=parts.length===4 && parts.every(Number.isFinite) && parts[0]<parts[1] && parts[2]<parts[3]
      ? {x0:parts[0],x1:parts[1],y0:parts[2],y1:parts[3]}
      : machineWorkBox()
    setFit(f=>{
      const sized=maxSizeForLimit(box,f.marginMm)
      return {...f,...sized,workX0:box.x0,workX1:box.x1,workY0:box.y0,workY1:box.y1}
    })
  },[limitKey])

  const fitted=useMemo(()=>{
    if(!raw.length) return [] as Polylines
    try{ setError(''); return fitToWork(raw,fit) }
    catch(e){ setError(e instanceof Error?e.message:String(e)); return [] as Polylines }
  },[raw,fit])

  const stats=useMemo(()=>fitted.length?pathStats(fitted,feed):null,[fitted,feed])

  useEffect(()=>{
    if(fitted.length) setGcode(polylinesToGcode(fitted,{feed}))
    else setGcode([])
  },[fitted,feed])

  useEffect(()=>{
    const canvas=canvasRef.current
    if(!canvas) return
    const ctx=canvas.getContext('2d')
    if(!ctx) return
    const box=workBoxOf(fit)
    const spanX=Math.max(1e-6,box.x1-box.x0), spanY=Math.max(1e-6,box.y1-box.y0)
    const W=canvas.width, H=canvas.height
    ctx.clearRect(0,0,W,H)
    ctx.fillStyle='#f7fafc'
    ctx.fillRect(0,0,W,H)
    const sx=W/spanX, sy=H/spanY
    ctx.strokeStyle='#94a3b8'
    ctx.lineWidth=2
    ctx.strokeRect(1,1,W-2,H-2)
    ctx.fillStyle='#64748b'
    ctx.font='12px system-ui'
    ctx.fillText(`${spanX.toFixed(1)} × ${spanY.toFixed(1)} mm limit`, 8, 16)
    if(!fitted.length) return
    ctx.strokeStyle='#0f766e'
    ctx.lineWidth=1.5
    for(const poly of fitted){
      if(poly.length<2) continue
      ctx.beginPath()
      ctx.moveTo((poly[0].x-box.x0)*sx, H-(poly[0].y-box.y0)*sy)
      for(let i=1;i<poly.length;i++) ctx.lineTo((poly[i].x-box.x0)*sx, H-(poly[i].y-box.y0)*sy)
      ctx.stroke()
    }
  },[fitted,fit])

  async function loadFile(file:File){
    setBusy(true); setSavedName(null)
    try{
      const lower=file.name.toLowerCase()
      if(lower.endsWith('.svg') || file.type==='image/svg+xml'){
        const text=await file.text()
        setRaw(svgToPolylines(text))
        setNotice(`SVG loaded: ${file.name}`)
      } else if(/\.(png|jpe?g|webp)$/i.test(lower) || file.type.startsWith('image/')){
        const bitmap=await createImageBitmap(file)
        const c=document.createElement('canvas')
        // Downscale large images for tracing performance
        const maxDim=400
        const scale=Math.min(1, maxDim/Math.max(bitmap.width,bitmap.height))
        c.width=Math.max(2, Math.round(bitmap.width*scale))
        c.height=Math.max(2, Math.round(bitmap.height*scale))
        const ctx=c.getContext('2d')!
        ctx.drawImage(bitmap,0,0,c.width,c.height)
        const img=ctx.getImageData(0,0,c.width,c.height)
        const polys=rasterToPolylines(img.data,c.width,c.height,{threshold,invert:false,simplifyEps:1.2})
        if(!polys.length) throw new Error('No contours found — try adjusting threshold')
        setRaw(polys)
        setNotice(`Raster traced: ${file.name} (${polys.length} contours)`)
      } else throw new Error('Use SVG, PNG, or JPG')

      // Optional private pattern storage (existing API) — best-effort for images
      try{
        if(!lower.endsWith('.svg')){
          const body=new FormData(); body.append('pattern', file)
          const result=await api<{filename:string;url:string}>('/patterns','POST',body)
          setSavedName(result.filename)
          // Keep private URL lifecycle out of canvas path
          void privateImage(result.url).catch(()=>{})
        }
      }catch{
        // Auth/storage failure should not block local toolpath generation for approved staff already on page
      }
    }catch(e){
      setRaw([]); setError(e instanceof Error?e.message:String(e)); setNotice('Load failed')
    }finally{ setBusy(false) }
  }

  async function loadSample(){
    setBusy(true); setSavedName(null); setError('')
    try{
      const res=await fetch('/samples/test-cut.svg')
      if(!res.ok) throw new Error('Sample SVG unavailable')
      const text=await res.text()
      setFit(f=>({...f,targetWidthMm:30,targetHeightMm:20,offsetXMm:0,offsetYMm:0,marginMm:2}))
      setRaw(svgToPolylines(text))
      setNotice('Sample SVG loaded: test-cut.svg (30 × 20 mm)')
    }catch(e){
      setRaw([]); setError(e instanceof Error?e.message:String(e)); setNotice('Load failed')
    }finally{ setBusy(false) }
  }

  async function startStream(){
    const c=serial.getClient()
    if(!c||!serial.ready) throw new Error('Connect USB first')
    if(!gcode.length) throw new Error('No G-code — fix bounds/fit first')
    if(error) throw new Error(error)
    if(!safetyAck) throw new Error('Confirm laser goggles and fire supervision first')
    await serial.assertStaff()
    setStreaming(true); setPaused(false); pauseRef.current=false; setProgress(0)
    try{
      // Arm only when it is off. Sending ARM again drops the arm on this board.
      if(!c.status?.armed) await c.arm()
      const lines=gcode.slice()
      for(let i=0;i<lines.length;i++){
        while(pauseRef.current){ await new Promise(r=>setTimeout(r,100)); if(!serial.ready) throw new Error('Link lost') }
        if(!serial.ready) throw new Error('Not connected')
        await c.streamGcode([lines[i]],{onProgress:()=>{}})
        setProgress(Math.round(((i+1)/lines.length)*100))
      }
      setNotice('Pattern stream finished (or reached end).')
    }catch(e){
      // STOP disarms the motors. Only use it when a move is actually in progress.
      if(c.status?.state==='moving'){ try{ await c.stop() }catch{} }
      if(c.ready&&c.status?.state!=='moving'&&!c.status?.armed){ try{ await c.arm() }catch{} }
      setNotice(e instanceof Error?e.message:String(e))
    }finally{
      setStreaming(false); setPaused(false); pauseRef.current=false; setSafetyAck(false)
    }
  }

  const box=workBoxOf(fit)
  const spanX=Math.round((box.x1-box.x0)*10)/10
  const spanY=Math.round((box.y1-box.y0)*10)/10
  const maxSize=maxSizeForLimit(box,fit.marginMm)
  const canvasW=445
  const canvasH=Math.max(160,Math.round(canvasW*spanY/Math.max(spanX,1)))

  return <section className="card" aria-labelledby="pattern-title">
    <h2 id="pattern-title">Pattern → laser toolpath → G-code</h2>
    <p className="notice">SVG paths preferred. Raster PNG/JPG uses client-side threshold + marching-squares outlines (not CAD-quality). No laser kerf offset. G-code turns the laser OFF (M5) before every travel move and ON (M3) only for cutting moves. The relay has a small switching delay, so expect small burn spots where paths start/end, and there is no laser power control. Only approved owner/staff can stream to the machine.</p>
    <p className="notice" role="alert" style={{background:'#fde8e8',border:'2px solid #b52035',color:'#5c0b16',padding:'0.6rem',borderRadius:8}}><strong>⚠ Laser cutting:</strong> wear laser safety goggles rated for the laser wavelength, never leave a running cut unattended (fabric can catch fire), keep an extinguisher and the laser power switch within reach, and ventilate the smoke.</p>
    <div className="actions">
      <button className="btn btn-primary" disabled={busy||streaming} onClick={()=>fileRef.current?.click()}>{busy?'Loading…':'Upload SVG / PNG / JPG'}</button>
      <button className="btn" disabled={busy||streaming} onClick={()=>void loadSample()}>Try sample SVG</button>
      <input ref={fileRef} hidden type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0]; e.target.value=''; if(f) void loadFile(f)}}/>
      {savedName?<span>Saved privately as {savedName}</span>:null}
    </div>
    <div className="grid grid-2">
      <div>
        <label>Width mm <input type="number" min={1} value={fit.targetWidthMm} onChange={e=>setFit(f=>clampSize(f,'targetWidthMm',Number(e.target.value)))}/></label>
        <label>Length mm <input type="number" min={1} value={fit.targetHeightMm} onChange={e=>setFit(f=>clampSize(f,'targetHeightMm',Number(e.target.value)))}/></label>
        <p className="notice">{serial.packet?.soft_limit
          ? `Saved limit ${spanX} × ${spanY} mm. Width and length are set to the maximum that fits: ${maxSize.targetWidthMm} × ${maxSize.targetHeightMm} mm.`
          : `No saved limit yet. Width and length use the full bed, maximum ${maxSize.targetWidthMm} × ${maxSize.targetHeightMm} mm.`}</p>
        <label>Offset X mm <input type="number" value={fit.offsetXMm} onChange={e=>setFit({...fit,offsetXMm:Number(e.target.value)})}/></label>
        <label>Offset Y mm <input type="number" value={fit.offsetYMm} onChange={e=>setFit({...fit,offsetYMm:Number(e.target.value)})}/></label>
        <label>Margin mm <input type="number" value={fit.marginMm} onChange={e=>setFit(f=>{
          const marginMm=Number(e.target.value)
          const sized=maxSizeForLimit(workBoxOf(f),Number.isFinite(marginMm)?marginMm:f.marginMm)
          return {...f,marginMm,targetWidthMm:Math.min(f.targetWidthMm,sized.targetWidthMm),targetHeightMm:Math.min(f.targetHeightMm,sized.targetHeightMm)}
        })}/></label>
        <label>Rotation
          <select value={fit.rotationDeg} onChange={e=>setFit({...fit,rotationDeg:Number(e.target.value) as 0|90})}>
            <option value={0}>0°</option>
            <option value={90}>90°</option>
          </select>
        </label>
        <label><input type="checkbox" checked={fit.keepAspect} onChange={e=>setFit({...fit,keepAspect:e.target.checked})}/> Keep aspect</label>
        <label>Raster threshold <input type="range" min={20} max={220} value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/> {threshold}</label>
      </div>
      <div>
        <canvas ref={canvasRef} width={canvasW} height={canvasH} style={{width:'100%',maxWidth:320,height:'auto',border:'1px solid #cbd5e1',background:'#fff'}}/>
        {stats?<p>Laser cut ~{stats.lengthMm.toFixed(1)} mm · travel ~{stats.travelMm.toFixed(1)} mm · est. {(stats.estimateMin).toFixed(1)} min @ {feed} mm/min</p>:null}
        {error?<p role="alert">{error}</p>:null}
        <p>{gcode.length} G-code lines · {notice}</p>
        <progress max={100} value={progress}/>
        <label><input type="checkbox" checked={safetyAck} disabled={streaming} onChange={e=>setSafetyAck(e.target.checked)}/> I am wearing laser goggles and will supervise the cut</label>
        <div className="actions">
          <button className="btn btn-primary" disabled={!serial.ready||!gcode.length||!!error||streaming||!safetyAck} onClick={()=>void startStream().catch(e=>setNotice(e.message))}>Start laser cut</button>
          <button className="btn" disabled={!streaming} onClick={()=>{pauseRef.current=!pauseRef.current; setPaused(pauseRef.current)}}>{paused?'Resume':'Pause'}</button>
          <button className="btn" style={{background:'#b52035',color:'#fff'}} disabled={!serial.ready&&!streaming} onClick={()=>void serial.getClient()?.stop()}>STOP</button>
        </div>
        <details><summary>G-code preview</summary><pre style={{maxHeight:180,overflow:'auto',fontSize:12}}>{gcode.slice(0,80).join('\n')}{gcode.length>80?'\n…':''}</pre></details>
      </div>
    </div>
  </section>
}
