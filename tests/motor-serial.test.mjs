import test from 'node:test'
import assert from 'node:assert/strict'
import {StepperSerialClient, decodeStatus, assertLaserGcodeLine} from '../lib/client/motor-serial.mjs'

const base = {
  v: 3, session: 345, ack: 1, mode: 'STEPPER_LASER', armed: false, state: 'idle',
  x: 0, y: 0, feed: 200, coils: 'off', laser: 'off', laser_latched: false,
  laser_pin: 26, laser_active_low: true, reason: 'ok',
  steps_per_mm: 102.4, x_max: 444.5, y_max: 650,
}

// Fake MCU that mirrors the firmware laser policy closely enough for client tests.
class FakePort {
  constructor() {
    this.lines = []
    this.packet = { ...base }
    this.openCount = 0
    this.laserHistory = []
    this.job = []
    this.readable = new ReadableStream({ start: (c) => { this.rx = c } })
    this.writable = new WritableStream({
      write: (chunk) => {
        const line = new TextDecoder().decode(chunk).trim()
        this.lines.push(line)
        const t = line.split(' ')
        if (t[0] !== 'F2') throw new Error('expected F2 frame')
        if (t[2] === 'HELLO') {
          this.packet = { ...base, ack: Number(t[1]), session: 345, armed: false, state: 'idle' }
        } else {
          assert.equal(t[2], '345')
          this.packet.ack = Number(t[1])
          const verb = t.slice(3).join(' ')
          const p = this.packet
          if (verb === 'ARM') { p.armed = true; p.reason = 'armed'; p.laser = 'off'; p.laser_latched = false }
          if (verb === 'STOP') { p.armed = false; p.state = 'idle'; p.reason = 'stop'; p.laser = 'off'; p.laser_latched = false }
          if (verb === 'M3') { if (p.armed) { p.laser_latched = true; p.reason = 'laser_on' } else { p.reason = 'not_armed' } }
          if (verb === 'M5') {
            p.laser_latched = false; p.laser = 'off'; p.reason = 'laser_off'
            if (this.disarmOnM5) p.armed = false
          }
          const pose = (v) => {
            const xm = /(?:^|\s)X(-?\d+(?:\.\d+)?)/i.exec(v)
            const ym = /(?:^|\s)Y(-?\d+(?:\.\d+)?)/i.exec(v)
            if (xm) p.x = Number(xm[1])
            if (ym) p.y = Number(ym[1])
          }
          if (verb.startsWith('JOG') || verb.startsWith('G0')) {
            if (!p.armed) { p.reason = 'not_armed'; p.laser = 'off' }
            else { pose(verb); p.laser = 'off'; p.state = 'idle'; p.reason = 'done' }
          }
          if (verb.startsWith('G1') && verb.includes('X999')) {
            p.reason = 'soft_limit'; p.laser = 'off'; p.laser_latched = false
          } else if (verb.startsWith('G1')) {
            pose(verb)
            p.laser = p.armed && p.laser_latched ? 'on' : 'off'
            p.state = 'idle'; p.reason = 'done'
          }
          if (verb === 'SET_ORIGIN') { p.x = 0; p.y = 0 }
          if (verb === 'JOBUP') {
            this.job = []
            p.reason = 'ok'
            p.job = 'idle'
            p.job_reason = ''
            p.job_loaded = 0
            p.job_total_lines = 0
            p.job_file_line = 0
          } else if (verb.startsWith('JOBLINE ')) {
            const body = verb.slice('JOBLINE '.length)
            if (body.includes('NOPE')) {
              p.reason = 'bad_command'
              p.job_reason = 'too_large'
            } else {
              this.job.push(body)
              p.reason = 'ok'
              p.job_reason = ''
              p.job_loaded = this.job.join('\n').length + this.job.length
            }
          } else if (verb === 'JOBEND') {
            p.job_total_lines = this.job.length
            p.job_loaded = this.job.length ? this.job.join('\n').length + this.job.length : 0
            p.job_reason = this.job.length ? '' : 'empty'
            p.reason = this.job.length ? 'ok' : 'bad_command'
          } else if (verb === 'JOBRUN') {
            p.reason = 'ok'
            p.job = 'running'
            p.state = 'moving'
            p.job_reason = ''
            p.job_file_line = 0
            p.job_total_lines = this.job.length
            p.job_loaded = this.job.length ? this.job.join('\n').length + this.job.length : 0
          }
          this.laserHistory.push([verb, p.laser])
        }
        this.rx.enqueue(new TextEncoder().encode(JSON.stringify(this.packet) + '\n'))
      },
    })
  }
  async open() { this.openCount++ }
  async close() {}
}

test('decodeStatus accepts v3 laser telemetry and rejects old v2 pen / v1 relay', () => {
  assert.equal(decodeStatus(JSON.stringify(base)).mode, 'STEPPER_LASER')
  assert.equal(decodeStatus(JSON.stringify({ ...base, mode: ' STEPPER_LASER' })).mode, 'STEPPER_LASER')
  assert.throws(() => decodeStatus(JSON.stringify({ ...base, v: 2, mode: 'STEPPER', z: 0 })))
  assert.throws(() => decodeStatus(JSON.stringify({ ...base, v: 1, mode: 'HARDWARE' })))
  assert.throws(() => decodeStatus(JSON.stringify({ ...base, laser: 'maybe' })))
})

test('Z / pen commands are refused client-side', () => {
  assert.throws(() => assertLaserGcodeLine('G1 X1 Y1 Z5'))
  assert.throws(() => assertLaserGcodeLine('PENDOWN'))
  assert.doesNotThrow(() => assertLaserGcodeLine('G1 X1.000 Y2.000 F200'))
})

test('no motion or laser without connect', async () => {
  const c = new StepperSerialClient()
  await assert.rejects(c.jog('X', 1))
  await assert.rejects(c.arm())
  await assert.rejects(c.laserOn())
  assert.equal(c.port, null)
})

test('fake UART HELLO/ARM/jog/laser stream with ack flow', async () => {
  const port = new FakePort()
  const c = new StepperSerialClient()
  try {
    await c.connect(port)
    assert.equal(port.openCount, 1)
    assert.deepEqual(port.lines[0], 'F2 1 HELLO')
    await assert.rejects(c.jog('X', 1))
    await assert.rejects(c.laserOn(), /Arm required/)
    await c.arm()
    await assert.rejects(c.jog('Z', 1), /Bad axis/)
    await c.jog('X', 5, 200)
    assert.ok(port.lines.some((l) => l.includes('JOG X 5')))
    await c.streamGcode(['M5', 'G0 X1.000 Y2.000 F400', 'M3', 'G1 X3.000 Y4.000 F200', 'M5'], { onProgress: () => {} })
    assert.ok(port.lines.some((l) => l.includes('G1 X3.000 Y4.000')))
    assert.deepEqual(port.laserHistory.filter(([v]) => /^G/.test(v)), [['G0 X1.000 Y2.000 F400', 'off'], ['G1 X3.000 Y4.000 F200', 'on']])
    assert.equal(c.status.laser, 'off')
    await assert.rejects(c.streamGcode(['G1 X1 Y1 Z-1']), /Z\/pen/)
    await c.stop()
    assert.equal(c.status.armed, false)
    assert.equal(c.status.laser, 'off')
  } finally {
    await c.disconnect(false)
  }
})

test('motion re-arms once when the board drops the arm', async () => {
  const port = new FakePort()
  port.disarmOnM5 = true
  const c = new StepperSerialClient()
  try {
    await c.connect(port)
    await c.arm()
    await c.streamGcode(['M5', 'G0 X1.000 Y2.000 F200'], { onProgress: () => {} })
    assert.equal(c.status.armed, true)
    assert.ok(port.lines.filter((l) => l.endsWith(' ARM')).length >= 2)
    assert.ok(port.lines.some((l) => l.includes('G0 X1.000 Y2.000 F200')))
  } finally {
    await c.disconnect(false)
  }
})

test('stream failure sends M5 (laser off)', async () => {
  const port = new FakePort()
  const c = new StepperSerialClient()
  try {
    await c.connect(port)
    await c.arm()
    await assert.rejects(c.streamGcode(['M3', 'G1 X999 Y1 F200']), /soft_limit/)
    assert.ok(port.lines.at(-1).endsWith(' M5'))
  } finally {
    await c.disconnect(false)
  }
})

test('saved start point is a laser-off travel', async () => {
  const port = new FakePort()
  const c = new StepperSerialClient()
  try {
    await c.connect(port)
    await c.arm()
    port.packet.start_on = true
    port.packet.start_x = 12.5
    port.packet.start_y = 40
    port.packet.laser = 'off'
    await c.setStartPoint(12.5, 40)
    assert.ok(port.lines.at(-1).endsWith(' SETPOINT 12.5 40'))
    await c.goStartPoint(200)
    assert.ok(port.lines.at(-1).endsWith(' STARTPT F200'))
    assert.equal(c.status.laser, 'off')
  } finally {
    await c.disconnect(false)
  }
})

test('upload stores every line, then JOBRUN only after JOBEND succeeds', async () => {
  const port = new FakePort()
  const c = new StepperSerialClient()
  try {
    await c.connect(port)
    await c.arm()
    const before = port.lines.length
    await c.uploadAndRun(['M5', 'G1 X1.000 Y2.000 F200'])
    const sent = port.lines.slice(before).map((l) => l.split(' ').slice(3).join(' ')).filter((v) => v.startsWith('JOB'))
    assert.deepEqual(sent, ['JOBUP', 'JOBLINE M5', 'JOBLINE G1 X1.000 Y2.000 F200', 'JOBEND', 'JOBRUN'])
    assert.equal(c.localJob, true)
    assert.equal(c.status.job, 'running')
  } finally {
    c.localJob = false
    await c.disconnect(false)
  }
})

test('a failed upload does not send JOBRUN', async () => {
  const port = new FakePort()
  const c = new StepperSerialClient()
  try {
    await c.connect(port)
    await c.arm()
    await assert.rejects(c.uploadAndRun(['G1 X1 NOPE Y1 F200']), /rejected|Upload failed|bad_command/)
    assert.equal(port.lines.some((l) => l.endsWith(' JOBRUN')), false)
    assert.equal(c.localJob, false)
  } finally {
    c.localJob = false
    await c.disconnect(false)
  }
})

test('after JOBRUN a telemetry gap does not send STOP or M5', async () => {
  const port = new FakePort()
  const errors = []
  const c = new StepperSerialClient(() => {}, (e) => errors.push(e))
  try {
    await c.connect(port)
    await c.arm()
    await c.uploadAndRun(['M5', 'G1 X1 Y1 F200'])
    const mark = port.lines.length
    c.lastRx = Date.now() - 10000
    await new Promise((r) => setTimeout(r, 700))
    const after = port.lines.slice(mark).join('\n')
    assert.equal(errors.length, 0)
    assert.doesNotMatch(after, /\bSTOP\b/)
    assert.doesNotMatch(after, /\bM5\b/)
    assert.equal(c.localJob, true)
  } finally {
    c.localJob = false
    await c.disconnect(false)
  }
})

test('STOP and laser OFF work when stale', async () => {
  const c = new StepperSerialClient()
  const port = new FakePort()
  try {
    await c.connect(port)
    await c.arm()
    c.lastRx = Date.now() - 5000
    await c.laserOff()
    assert.ok(port.lines.at(-1).endsWith(' M5'))
    await c.stop()
    assert.ok(port.lines.at(-1).endsWith(' STOP'))
  } finally {
    await c.disconnect(false)
  }
})
