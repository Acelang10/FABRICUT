/**
 * X-axis test commands for the ESP32 firmware (3x 28BYJ-48 + ULN2003: Y + mirrored X1/X2).
 * Limits mirror FabricutConfig.h: max 4096 steps per move, 1–20 cycles, 50–700 steps/s.
 * The same validation runs in the browser (USB serial) and on the server (Wi-Fi proxy).
 * No laser, G-code, JOG, Y or SET_ORIGIN commands are allowed here.
 */
export const X_LIMITS={maxSteps:4096,minCycles:1,maxCycles:20,minSps:50,maxSps:700} as const
export const STEP_SIZES=[64,128,512,1024] as const
/** Half-steps: 1024 steps = 10 mm. */
export const STEPS_PER_MM=102.4

/** Commands the ESP32 phone/Wi-Fi endpoint accepts (WebSafety.h webAllowed). */
export const WIFI_COMMANDS=['STOP','DISARM','ARM','STATUS','XFWD','XBACK','XTEST','XSPEED','INVX2','INVX'] as const
/** USB serial additionally allows XARM (30 s lease for hand testing). */
export const SERIAL_COMMANDS=[...WIFI_COMMANDS,'XARM','HELLO'] as const

function int(value:string|undefined,min:number,max:number,label:string){
  if(value===undefined) return undefined
  if(!/^\d{1,5}$/.test(value)) throw new Error(`${label} must be a whole number`)
  const n=Number(value)
  if(n<min||n>max) throw new Error(`${label} must be ${min}–${max}`)
  return n
}

/** Validates and normalises one command line. Throws with a readable message when not allowed. */
export function validateXCommand(line:string,transport:'wifi'|'serial'='wifi'){
  const raw=String(line||'').trim()
  if(!raw||raw.length>60||/[^\x20-\x7e]/.test(raw)) throw new Error('Invalid command')
  const [verbRaw,...args]=raw.split(/\s+/)
  const verb=verbRaw.toUpperCase()
  const allowed:readonly string[]=transport==='wifi'?WIFI_COMMANDS:SERIAL_COMMANDS
  if(!allowed.includes(verb)) throw new Error(`${verb} is not allowed from the controller (laser and G-code are disabled here)`)
  const out=[verb]
  switch(verb){
    case 'XFWD': case 'XBACK': {
      if(args.length>2) throw new Error('Usage: XFWD [steps] [steps/s]')
      const steps=int(args[0],1,X_LIMITS.maxSteps,'Steps'), sps=int(args[1],X_LIMITS.minSps,X_LIMITS.maxSps,'Speed')
      if(steps!==undefined) out.push(String(steps))
      if(sps!==undefined) out.push(String(sps))
      break
    }
    case 'XTEST': {
      if(args.length>3) throw new Error('Usage: XTEST [steps] [cycles] [steps/s]')
      const steps=int(args[0],1,X_LIMITS.maxSteps,'Steps'), cycles=int(args[1],X_LIMITS.minCycles,X_LIMITS.maxCycles,'Cycles'), sps=int(args[2],X_LIMITS.minSps,X_LIMITS.maxSps,'Speed')
      for(const v of [steps,cycles,sps]) if(v!==undefined) out.push(String(v))
      break
    }
    case 'XSPEED': {
      if(args.length!==1) throw new Error('Usage: XSPEED <steps/s>')
      out.push(String(int(args[0],X_LIMITS.minSps,X_LIMITS.maxSps,'Speed')))
      break
    }
    case 'INVX2': case 'INVX': {
      if(args.length>1||(args[0]!==undefined&&!['0','1'].includes(args[0]))) throw new Error(`Usage: ${verb} [0|1]`)
      if(args[0]!==undefined) out.push(args[0])
      break
    }
    default:
      if(args.length) throw new Error(`${verb} takes no arguments`)
  }
  return out.join(' ')
}

/** Commands that can move a motor (blocked in dry-run). */
export function isMotionCommand(line:string){
  return /^(XFWD|XBACK|XTEST)\b/i.test(line.trim())
}

/** Telemetry fields the controller shows (firmware sends more; extras are ignored). */
export interface XTelemetry {
  state?:string;armed?:boolean;x?:number;y?:number;reason?:string;laser?:string
  x_steps?:number;x2_invert?:boolean;x_invert?:boolean;xtest?:string;xtest_legs_left?:number;xtest_sps?:number
  arm_left_ms?:number;lease_ms?:number;web?:boolean;web_motion?:boolean;coils?:string
}

export function parseTelemetry(value:unknown):XTelemetry|null{
  if(!value||typeof value!=='object') return null
  const p=value as Record<string,unknown>
  if(p.v!==3) return null
  return p as XTelemetry
}
