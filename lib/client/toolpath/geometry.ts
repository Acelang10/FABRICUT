import type { Point, Polyline, Polylines, PathStats } from './types'
import { DEFAULT_FEED_MM_PER_MIN, DEFAULT_TRAVEL_FEED } from './types'

export function dist(a: Point, b: Point): number {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.hypot(dx, dy)
}

export function polylineLength(poly: Polyline): number {
  let n = 0
  for (let i = 1; i < poly.length; i++) n += dist(poly[i - 1], poly[i])
  return n
}

export function boundsOf(polys: Polylines) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let any = false
  for (const poly of polys) for (const p of poly) {
    any = true
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  if (!any) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

export function pathStats(polys: Polylines, feed = DEFAULT_FEED_MM_PER_MIN, travelFeed = DEFAULT_TRAVEL_FEED): PathStats {
  let lengthMm = 0, travelMm = 0
  let prevEnd: Point | null = null
  for (const poly of polys) {
    if (poly.length < 2) continue
    if (prevEnd) travelMm += dist(prevEnd, poly[0])
    lengthMm += polylineLength(poly)
    prevEnd = poly[poly.length - 1]
  }
  const cutMin = lengthMm / Math.max(1, feed)
  const travelMin = travelMm / Math.max(1, travelFeed)
  return { lengthMm, travelMm, estimateMin: cutMin + travelMin, bounds: boundsOf(polys) }
}

/** Ramer–Douglas–Peucker */
export function simplifyRdp(poly: Polyline, epsilon: number): Polyline {
  if (poly.length < 3) return poly.slice()
  const sq = epsilon * epsilon
  const keep = new Uint8Array(poly.length)
  keep[0] = 1
  keep[poly.length - 1] = 1
  const stack: Array<[number, number]> = [[0, poly.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    const a = poly[start], b = poly[end]
    let maxD = -1, idx = -1
    for (let i = start + 1; i < end; i++) {
      const d = pointSegDist2(poly[i], a, b)
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > sq && idx >= 0) {
      keep[idx] = 1
      stack.push([start, idx], [idx, end])
    }
  }
  const out: Polyline = []
  for (let i = 0; i < poly.length; i++) if (keep[i]) out.push(poly[i])
  return out
}

function pointSegDist2(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  if (dx === 0 && dy === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)
  t = Math.max(0, Math.min(1, t))
  const x = a.x + t * dx, y = a.y + t * dy
  return (p.x - x) ** 2 + (p.y - y) ** 2
}

export function densify(poly: Polyline, maxSeg: number): Polyline {
  if (poly.length < 2) return poly.slice()
  const out: Polyline = [poly[0]]
  for (let i = 1; i < poly.length; i++) {
    const a = out[out.length - 1], b = poly[i]
    const d = dist(a, b)
    const n = Math.max(1, Math.ceil(d / maxSeg))
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + (b.x - a.x) * (k / n), y: a.y + (b.y - a.y) * (k / n) })
    }
  }
  return out
}
