import type { Polylines, Polyline, Point } from './types'
import { simplifyRdp } from './geometry'

/** Grayscale threshold -> binary mask (1 = ink). */
export function thresholdMask(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold = 128,
  invert = false,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const g = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
    let ink = g < threshold ? 1 : 0
    if (invert) ink = ink ? 0 : 1
    mask[i] = ink as 0 | 1
  }
  return mask
}

// Marching squares edge table: for each case, list of edge-pair segments (edge ids 0..3).
// Edges: 0=top, 1=right, 2=bottom, 3=left
const MS: Array<Array<[number, number]>> = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[3, 0], [1, 2]], // saddle resolved simply
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]], // ambiguous simplified via alternate
  [[0, 1], [2, 3]],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[0, 3]],
  [],
]
// Fix cases 5 and 10 to consistent pairs:
MS[5] = [[3, 2], [0, 1]]
MS[10] = [[0, 3], [1, 2]]

function edgePoint(edge: number, x: number, y: number): Point {
  switch (edge) {
    case 0: return { x: x + 0.5, y }
    case 1: return { x: x + 1, y: y + 0.5 }
    case 2: return { x: x + 0.5, y: y + 1 }
    default: return { x, y: y + 0.5 }
  }
}

function key(p: Point): string {
  return `${p.x.toFixed(3)},${p.y.toFixed(3)}`
}

/** Extract open/closed polylines from a binary mask using marching squares + chaining. */
export function maskToPolylines(mask: Uint8Array, width: number, height: number, simplifyEps = 0.75): Polylines {
  type Seg = { a: Point; b: Point }
  const segs: Seg[] = []
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x])
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const idx = (at(x, y) << 3) | (at(x + 1, y) << 2) | (at(x + 1, y + 1) << 1) | at(x, y + 1)
      for (const [e0, e1] of MS[idx]) {
        segs.push({ a: edgePoint(e0, x, y), b: edgePoint(e1, x, y) })
      }
    }
  }
  // Chain segments
  const adj = new Map<string, Point[]>()
  const add = (p: Point, q: Point) => {
    const k = key(p)
    const arr = adj.get(k) || []
    arr.push(q)
    adj.set(k, arr)
  }
  for (const s of segs) { add(s.a, s.b); add(s.b, s.a) }

  const used = new Set<string>()
  const edgeKey = (a: Point, b: Point) => {
    const ka = key(a), kb = key(b)
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
  }

  const polys: Polylines = []
  for (const [k, neighbors] of adj) {
    // start at endpoints (degree 1) preferentially
    if (neighbors.length !== 1 && neighbors.length !== 2) continue
  }
  const starts = [...adj.entries()].filter(([, n]) => n.length === 1).map(([k]) => k)
  const allKeys = starts.length ? starts : [...adj.keys()]

  for (const startKey of allKeys) {
    const startParts = startKey.split(',').map(Number)
    let curr: Point = { x: startParts[0], y: startParts[1] }
    let poly: Polyline = [curr]
    for (;;) {
      const nbrs = adj.get(key(curr)) || []
      let next: Point | null = null
      for (const n of nbrs) {
        const ek = edgeKey(curr, n)
        if (!used.has(ek)) { used.add(ek); next = n; break }
      }
      if (!next) break
      poly.push(next)
      curr = next
      if (key(curr) === startKey && poly.length > 2) break
      if (poly.length > width * height * 2) break
    }
    if (poly.length >= 2) polys.push(simplifyRdp(poly, simplifyEps))
  }
  // Deduplicate very short
  return polys.filter((p) => p.length >= 2)
}

export function rasterToPolylines(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  opts: { threshold?: number; invert?: boolean; simplifyEps?: number } = {},
): Polylines {
  const mask = thresholdMask(rgba, width, height, opts.threshold ?? 128, opts.invert ?? false)
  return maskToPolylines(mask, width, height, opts.simplifyEps ?? 0.8)
}
