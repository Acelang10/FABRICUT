// Fabricut stepper + laser-relay Web Serial client — protocol v3 (F2 framing), matches ESP32 firmware.
// Two steppers (X short, Y long). The old Z pen stepper was replaced by a relay on GPIO26
// that switches the cutting laser: M3 = laser enable (fires only during G1), M5 = laser OFF.
export const PROTOCOL_VERSION = 3;
export const MODE = 'STEPPER_LASER';

export function decodeStatus(line) {
  if (line.length > 1024) throw new Error('Oversize telemetry');
  const p = JSON.parse(line);
  if (p.v !== PROTOCOL_VERSION || p.mode !== MODE)
    throw new Error('Invalid telemetry: flash the laser-relay firmware (protocol v3)');
  if (!Number.isInteger(p.session) || p.session < 0 || !Number.isInteger(p.ack) || p.ack < 0)
    throw new Error('Bad session/ack');
  if (typeof p.armed !== 'boolean' || !['idle', 'moving'].includes(p.state))
    throw new Error('Bad armed/state');
  if (![p.x, p.y].every(Number.isFinite)) throw new Error('Bad pose');
  if (!['on', 'off'].includes(p.laser) || typeof p.laser_latched !== 'boolean')
    throw new Error('Bad laser state');
  if (typeof p.reason !== 'string' || p.reason.length > 48) throw new Error('Bad reason');
  return p;
}

const REJECT_REASONS = ['busy', 'not_armed', 'soft_limit', 'bad_command'];
const MOTION_RE = /^(G0|G00|G1|G01|JOG)\b/i;
const LASER_ON_RE = /^(M3|M4|LASERON)\b/i;
// Z words / pen commands are not valid any more: reject them before they reach the MCU.
const Z_RE = /(^|\s)Z[-+.\d]/i;
const PEN_RE = /^(PENUP|PENDOWN|ZUP|ZDOWN)\b/i;

export function assertLaserGcodeLine(verb) {
  if (Z_RE.test(verb) || PEN_RE.test(verb)) throw new Error(`Z/pen command not supported on laser machine: '${verb}'`);
}

export class StepperSerialClient {
  constructor(onStatus = () => {}, onError = () => {}) {
    this.onStatus = onStatus;
    this.onError = onError;
    this.session = 0;
    this.seq = 0;
    this.pending = new Map();
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.status = null;
    this.lastRx = 0;
    this.closing = false;
    this.timer = null;
    this.streamAbort = null;
  }

  get ready() {
    return !!this.port && !!this.writer && !!this.session && Date.now() - this.lastRx < 900 && !this.closing;
  }

  async connect(port) {
    if (this.port) throw new Error('Already connected');
    this.closing = false;
    this.seq = 0;
    this.session = 0;
    this.status = null;
    this.port = port;
    try {
      await port.open({ baudRate: 115200 });
      if (!port.writable || !port.readable) throw new Error('Serial streams unavailable');
      this.writer = port.writable.getWriter();
      this.reader = port.readable.getReader();
      this.pumpPromise = this.pump();
      await this.send('HELLO', true);
      this.timer = setInterval(() => {
        if (!this.ready) {
          this.fail(new Error('Telemetry lost: physical state UNKNOWN; MCU lease will expire and turn the laser OFF.'));
          return;
        }
        // Heartbeat keeps the MCU lease alive while armed; silence => MCU STOP + laser OFF.
        if (this.status?.armed) this.send('STATUS').catch(() => {});
      }, 400);
    } catch (e) {
      await this.disconnect(false);
      throw e;
    }
  }

  async send(verb, hello = false, allowStaleStop = false) {
    if (!this.writer || this.closing || (!hello && !allowStaleStop && !this.ready))
      throw new Error('Device disconnected or telemetry stale');
    if (this.seq >= 2147483646) throw new Error('Reconnect to renew sequence');
    const seq = ++this.seq;
    const line = hello ? `F2 ${seq} HELLO\n` : `F2 ${seq} ${this.session} ${verb}\n`;
    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error('No MCU acknowledgement: physical state UNKNOWN'));
      }, 900);
      this.pending.set(seq, { resolve, reject, timer, hello });
    });
    try {
      await this.writer.write(new TextEncoder().encode(line));
      return await reply;
    } catch (e) {
      const p = this.pending.get(seq);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(seq);
      }
      this.fail(e);
      throw e;
    }
  }

  async arm() {
    if (!this.ready || this.status?.state !== 'idle') throw new Error('Connect and wait for idle before arming');
    return this.send('ARM');
  }
  async stop() {
    if (!this.writer || !this.session) throw new Error('No serial link: use the physical emergency stop / laser power switch');
    if (this.streamAbort) this.streamAbort.abort = true;
    return this.send('STOP', false, true);
  }
  async setOrigin() {
    if (!this.ready) throw new Error('Not connected');
    return this.send('SET_ORIGIN');
  }
  async jog(axis, mm, feed) {
    const a = String(axis).toUpperCase();
    if (!['X', 'Y'].includes(a)) throw new Error('Bad axis (laser machine has X and Y only)');
    const n = Number(mm);
    if (!Number.isFinite(n)) throw new Error('Bad jog distance');
    if (!this.ready || !this.status?.armed || this.status.state !== 'idle')
      throw new Error('Arm and idle required for jog');
    const f = Number(feed);
    const feedPart = Number.isFinite(f) ? ` F${Math.round(f)}` : '';
    return this.send(`JOG ${a} ${n}${feedPart}`);
  }
  async g1(x, y, feed) {
    let cmd = 'G1';
    if (x != null) cmd += ` X${x}`;
    if (y != null) cmd += ` Y${y}`;
    if (feed != null) cmd += ` F${Math.round(feed)}`;
    return this.send(cmd);
  }
  /** M3: enable laser. The relay only closes while a G1 cutting move runs. Requires ARM. */
  async laserOn() {
    if (!this.ready || !this.status?.armed) throw new Error('Arm required before enabling the laser');
    return this.send('M3');
  }
  /** M5: laser relay OFF. Allowed even with stale telemetry. */
  async laserOff() {
    if (!this.writer || !this.session) throw new Error('No serial link: switch off laser power physically');
    return this.send('M5', false, true);
  }
  async command(verb) {
    assertLaserGcodeLine(String(verb));
    return this.send(verb);
  }

  waitIdle(timeoutMs = 120000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (this.streamAbort?.abort) return reject(new Error('Stream stopped'));
        if (!this.ready) return reject(new Error('Link lost while waiting for idle'));
        if (this.status?.state === 'idle') return resolve(this.status);
        if (Date.now() - start > timeoutMs) return reject(new Error('Timeout waiting for idle'));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async streamGcode(lines, { onProgress } = {}) {
    if (!this.ready) throw new Error('Not connected');
    const cmds = lines.map((l) => String(l).trim()).filter(Boolean);
    cmds.forEach(assertLaserGcodeLine);
    this.streamAbort = { abort: false };
    try {
      if (!this.status?.armed) await this.arm();
      for (let i = 0; i < cmds.length; i++) {
        if (this.streamAbort.abort) throw new Error('Stream stopped');
        const verb = cmds[i];
        if (this.status?.state !== 'idle') await this.waitIdle();
        if (this.streamAbort.abort) throw new Error('Stream stopped');
        const packet = await this.send(verb);
        if (REJECT_REASONS.includes(packet.reason)) {
          throw new Error(`MCU rejected '${verb}': ${packet.reason} (laser forced OFF)`);
        }
        if (LASER_ON_RE.test(verb) && !packet.laser_latched) throw new Error(`MCU did not enable laser for '${verb}'`);
        if (MOTION_RE.test(verb)) await this.waitIdle();
        onProgress?.({ index: i + 1, total: cmds.length, line: verb, status: this.status });
      }
    } catch (e) {
      // Any failure or abort: best-effort laser OFF (firmware also turns it off on errors/STOP/lease).
      try { if (this.writer && this.session) await this.send('M5', false, true); } catch {}
      throw e;
    } finally {
      this.streamAbort = null;
    }
  }

  async pump() {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!this.closing && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 4096) throw new Error('Telemetry framing overflow');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line || !line.startsWith('{')) continue;
          const packet = decodeStatus(line);
          const pending = this.pending.get(packet.ack);
          if (pending?.hello) {
            if (!packet.session || packet.armed || packet.state !== 'idle' || packet.laser !== 'off')
              throw new Error('Unsafe handshake');
            this.session = packet.session;
          } else if (packet.session !== this.session) continue;
          if (packet.ack > this.seq) throw new Error('Unexpected acknowledgement');
          this.lastRx = Date.now();
          this.status = packet;
          this.onStatus(packet);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(packet.ack);
            pending.resolve(packet);
          }
        }
      }
    } catch (e) {
      if (!this.closing) this.fail(e);
    } finally {
      if (!this.closing) this.fail(new Error('Serial disconnected: physical state UNKNOWN (MCU lease turns laser OFF)'));
    }
  }

  fail(error) {
    if (this.closing) return;
    if (this.streamAbort) this.streamAbort.abort = true;
    this.onError(error instanceof Error ? error : new Error(String(error)));
    void this.disconnect(false);
  }

  async disconnect(requestStop = true) {
    if (this.closing) return;
    if (this.streamAbort) this.streamAbort.abort = true;
    if (requestStop && this.writer && this.session) {
      try {
        await this.send('STOP', false, true);
      } catch {}
    }
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Serial link closed'));
    }
    this.pending.clear();
    try {
      await this.reader?.cancel();
    } catch {}
    try {
      this.reader?.releaseLock();
    } catch {}
    this.reader = null;
    try {
      await this.writer?.close();
    } catch {}
    try {
      this.writer?.releaseLock();
    } catch {}
    this.writer = null;
    try {
      await this.port?.close();
    } catch {}
    this.port = null;
    this.session = 0;
    this.status = null;
  }
}

// Back-compat alias used by older imports.
export { StepperSerialClient as MotorSerialClient };
