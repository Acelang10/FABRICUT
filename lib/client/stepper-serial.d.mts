export const PROTOCOL_VERSION: 3
export const MODE: 'STEPPER_LASER'
export interface StepperStatus {
  v: 3
  session: number
  ack: number
  mode: 'STEPPER_LASER'
  armed: boolean
  state: 'idle' | 'moving'
  x: number
  y: number
  feed?: number
  coils?: string
  /** Physical relay output state reported by the MCU. */
  laser: 'on' | 'off'
  /** M3 latched: relay closes only while a G1 cutting move runs. */
  laser_latched: boolean
  laser_pin?: number
  laser_active_low?: boolean
  reason: string
  steps_per_mm?: number
  x_min?: number
  x_max?: number
  y_min?: number
  y_max?: number
  soft_limit?: boolean
  start_on?: boolean
  start_x?: number
  start_y?: number
  job?: string
  job_src?: string
  job_lines?: number
  job_reason?: string
  job_loaded?: number
  job_total_lines?: number
  job_file_line?: number
}
export type MotorStatus = StepperStatus
export interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
}
export function decodeStatus(line: string): StepperStatus
export function assertLaserGcodeLine(verb: string): void
export class StepperSerialClient {
  constructor(onStatus?: (status: StepperStatus) => void, onError?: (error: Error) => void)
  readonly ready: boolean
  readonly status: StepperStatus | null
  linkHold: boolean
  /** True after JOBRUN until the stored file reports finished. Link loss must not clear this. */
  localJob: boolean
  connect(port: SerialPortLike): Promise<void>
  arm(): Promise<StepperStatus>
  stop(): Promise<StepperStatus>
  setOrigin(): Promise<StepperStatus>
  setLimits(box: { xmin: number; xmax: number; ymin: number; ymax: number } | null): Promise<StepperStatus>
  setStartPoint(x: number, y: number): Promise<StepperStatus>
  goStartPoint(feed?: number): Promise<StepperStatus>
  jog(axis: 'X' | 'Y' | string, mm: number, feed?: number): Promise<StepperStatus>
  g1(x: number | null, y: number | null, feed?: number | null): Promise<StepperStatus>
  laserOn(): Promise<StepperStatus>
  laserOff(): Promise<StepperStatus>
  command(verb: string): Promise<StepperStatus>
  streamGcode(lines: string[], opts?: { onProgress?: (p: { index: number; total: number; line: string; status: StepperStatus | null }) => void }): Promise<void>
  uploadAndRun(lines: string[], opts?: { onProgress?: (p: { phase: string; index: number; total: number; line: string; status: StepperStatus | null }) => void }): Promise<StepperStatus>
  waitUntilJobDone(onProgress?: (status: StepperStatus | null) => void): Promise<StepperStatus | null>
  disconnect(requestStop?: boolean): Promise<void>
}
export { StepperSerialClient as MotorSerialClient }
