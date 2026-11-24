import type { Point, Polylines, WorkBox } from './types'
import { DEFAULT_FEED_MM_PER_MIN } from './types'
import { pathStats } from './geometry'

/** Firmware rejects one move longer than 4096 steps (40 mm at 102.4 steps/mm). */
const MAX_SEGMENT_MM = 30

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, (m) => (m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m))
}
// simpler fixed 3 decimals
function f3(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3)
}

function hops(from: Point, to: Point): Point[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist <= MAX_SEGMENT_MM) return [to]
  const n = Math.ceil(dist / MAX_SEGMENT_MM)
  const pts: Point[] = []
  for (let i = 1; i <= n; i++) pts.push({ x: from.x + (dx * i) / n, y: from.y + (dy * i) / n })
  return pts
}

function insideBox(p: Point, box: WorkBox) {
  return p.x >= box.x0 - 1e-6 && p.x <= box.x1 + 1e-6 && p.y >= box.y0 - 1e-6 && p.y <= box.y1 + 1e-6
}

/** Drop travel targets outside the saved box. The board rejects those and then reports laser_off. */
function travelPoints(from: Point, to: Point, limit?: WorkBox | null): Point[] {
  const pts = hops(from, to)
  if (!limit) return pts
  const kept = pts.filter((p) => insideBox(p, limit))
  if (!kept.length) return insideBox(to, limit) ? [to] : pts
  const last = kept[kept.length - 1]
  if (insideBox(to, limit) && (last.x !== to.x || last.y !== to.y)) kept.push(to)
  return kept
}

/**
 * Laser G-code for the Fabricut relay laser (protocol v3).
 * - M5 (laser OFF) at start, before every G0 travel move, and after the last cut.
 * - M3 (laser enable) only right before the G1 cutting moves of a path.
 * - After a finished pattern, G0 back to the start pose with the relay still off.
 * - No Z words: the machine has X/Y steppers and an on/off laser relay only.
 */
export function polylinesToGcode(
  polys: Polylines,
  opts: { feed?: number; travelFeed?: number; from?: Point; limit?: WorkBox | null } = {},
): string[] {
  const feed = opts.feed ?? DEFAULT_FEED_MM_PER_MIN
  // Travel at the same speed as the cut. A faster default (and a bare F line) never
  // moves this machine: jog works at the selected mm/min, and the board rejects F alone.
  const travel = opts.travelFeed ?? feed
  const lines: string[] = []
  const origin: Point = opts.from ?? { x: 0, y: 0 }
  let here: Point = origin
  lines.push('M5') // laser off before travel; the relay closes only on the G1 cut
  for (const poly of polys) {
    if (poly.length < 2) continue
    const start = poly[0]
    if (lines.at(-1) !== 'M5') lines.push('M5') // laser off before travel
    for (const p of travelPoints(here, start, opts.limit)) lines.push(`G0 X${f3(p.x)} Y${f3(p.y)} F${Math.round(travel)}`)
    here = start
    lines.push('M3') // laser on for this path's cutting moves
    for (let i = 1; i < poly.length; i++) {
      const p = poly[i]
      for (const q of hops(here, p)) lines.push(`G1 X${f3(q.x)} Y${f3(q.y)} F${Math.round(feed)}`)
      here = p
    }
    lines.push('M5') // laser off after cut
  }
  if (lines.at(-1) !== 'M5') lines.push('M5')
  // Relay stays off: M5 is already the last laser word. Skip the return when the
  // head is already there, or when the start pose is outside the soft-limit box
  // (the board would reject it and fail the finished cut).
  const alreadyThere = Math.abs(here.x - origin.x) < 1e-6 && Math.abs(here.y - origin.y) < 1e-6
  if (!alreadyThere && (!opts.limit || insideBox(origin, opts.limit))) {
    for (const p of hops(here, origin)) lines.push(`G0 X${f3(p.x)} Y${f3(p.y)} F${Math.round(travel)}`)
  }
  return lines
}

export function estimateFromGcodePolys(polys: Polylines, feed = DEFAULT_FEED_MM_PER_MIN) {
  return pathStats(polys, feed, feed)
}

export { fmt }
