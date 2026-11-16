import type { Polylines } from './types'
import { DEFAULT_FEED_MM_PER_MIN, DEFAULT_TRAVEL_FEED } from './types'
import { pathStats } from './geometry'

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, (m) => (m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m))
}
// simpler fixed 3 decimals
function f3(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3)
}

/**
 * Laser G-code for the Fabricut relay laser (protocol v3).
 * - M5 (laser OFF) at start, before every G0 travel move, and at the very end.
 * - M3 (laser enable) only right before the G1 cutting moves of a path.
 * - No Z words: the machine has X/Y steppers and an on/off laser relay only.
 */
export function polylinesToGcode(
  polys: Polylines,
  opts: { feed?: number; travelFeed?: number } = {},
): string[] {
  const feed = opts.feed ?? DEFAULT_FEED_MM_PER_MIN
  const travel = opts.travelFeed ?? DEFAULT_TRAVEL_FEED
  const lines: string[] = []
  lines.push(`F${Math.round(feed)}`)
  lines.push('M5') // laser off
  for (const poly of polys) {
    if (poly.length < 2) continue
    const start = poly[0]
    if (lines.at(-1) !== 'M5') lines.push('M5') // laser off before travel
    lines.push(`G0 X${f3(start.x)} Y${f3(start.y)} F${Math.round(travel)}`)
    lines.push('M3') // laser on for this path's cutting moves
    for (let i = 1; i < poly.length; i++) {
      const p = poly[i]
      lines.push(`G1 X${f3(p.x)} Y${f3(p.y)} F${Math.round(feed)}`)
    }
    lines.push('M5') // laser off after cut
  }
  if (lines.at(-1) !== 'M5') lines.push('M5')
  return lines
}

export function estimateFromGcodePolys(polys: Polylines, feed = DEFAULT_FEED_MM_PER_MIN) {
  return pathStats(polys, feed, DEFAULT_TRAVEL_FEED)
}

export { fmt }
