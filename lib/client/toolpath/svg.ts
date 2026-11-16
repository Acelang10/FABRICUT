import type { Point, Polyline, Polylines } from './types'
import { densify } from './geometry'

type Mat = [number, number, number, number, number, number] // a b c d e f

const I: Mat = [1, 0, 0, 1, 0, 0]
function mul(A: Mat, B: Mat): Mat {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ]
}
function apply(m: Mat, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}
function parseTransform(value: string | null): Mat {
  if (!value) return I
  let m: Mat = I
  const re = /(matrix|translate|scale|rotate)\(([^)]*)\)/gi
  let match
  while ((match = re.exec(value))) {
    const kind = match[1].toLowerCase()
    const nums = match[2].trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n))
    if (kind === 'matrix' && nums.length >= 6) m = mul(m, [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]])
    else if (kind === 'translate') m = mul(m, [1, 0, 0, 1, nums[0] || 0, nums[1] || 0])
    else if (kind === 'scale') {
      const sx = nums[0] ?? 1, sy = nums[1] ?? sx
      m = mul(m, [sx, 0, 0, sy, 0, 0])
    } else if (kind === 'rotate') {
      const ang = ((nums[0] || 0) * Math.PI) / 180
      const cx = nums[1] || 0, cy = nums[2] || 0
      const c = Math.cos(ang), s = Math.sin(ang)
      m = mul(m, mul([1, 0, 0, 1, cx, cy], mul([c, s, -s, c, 0, 0], [1, 0, 0, 1, -cx, -cy])))
    }
  }
  return m
}

function tokenizePath(d: string): Array<string | number> {
  const out: Array<string | number> = []
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g
  let m
  while ((m = re.exec(d))) {
    if (m[1]) out.push(m[1])
    else out.push(Number(m[2]))
  }
  return out
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  const pts: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    pts.push({
      x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
      y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    })
  }
  return pts
}

function sampleQuad(p0: Point, p1: Point, p2: Point, steps: number): Point[] {
  const pts: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    pts.push({
      x: u*u*p0.x + 2*u*t*p1.x + t*t*p2.x,
      y: u*u*p0.y + 2*u*t*p1.y + t*t*p2.y,
    })
  }
  return pts
}

export function parsePathD(d: string, ctm: Mat = I): Polylines {
  const tokens = tokenizePath(d)
  const polys: Polylines = []
  let i = 0, cmd = '', cx = 0, cy = 0, startX = 0, startY = 0
  let current: Polyline = []
  const pushPoint = (p: Point) => {
    const q = apply(ctm, p)
    if (!current.length || current[current.length - 1].x !== q.x || current[current.length - 1].y !== q.y)
      current.push(q)
    cx = p.x; cy = p.y
  }
  const endSub = () => {
    if (current.length >= 2) polys.push(current)
    current = []
  }
  while (i < tokens.length) {
    const t = tokens[i]
    if (typeof t === 'string') { cmd = t; i++; }
    else if (!cmd) { i++; continue }
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    if (C === 'Z') {
      pushPoint({ x: startX, y: startY })
      endSub()
      cx = startX; cy = startY
      continue
    }
    const need = C === 'H' || C === 'V' ? 1 : C === 'M' || C === 'L' || C === 'T' ? 2 : C === 'S' || C === 'Q' ? 4 : C === 'C' ? 6 : C === 'A' ? 7 : 0
    if (need === 0) { i++; continue }
    // successive coordinate pairs for M/L
    let first = true
    while (i + need - 1 < tokens.length && typeof tokens[i] === 'number') {
      const nums = tokens.slice(i, i + need) as number[]
      i += need
      if (C === 'M') {
        if (!first) { /* treat as L */ }
        else endSub()
        const x = rel ? cx + nums[0] : nums[0]
        const y = rel ? cy + nums[1] : nums[1]
        if (first) { startX = x; startY = y; current = []; pushPoint({ x, y }); first = false; cmd = rel ? 'l' : 'L'; continue }
        pushPoint({ x, y })
      } else if (C === 'L') {
        pushPoint({ x: rel ? cx + nums[0] : nums[0], y: rel ? cy + nums[1] : nums[1] })
      } else if (C === 'H') {
        pushPoint({ x: rel ? cx + nums[0] : nums[0], y: cy })
      } else if (C === 'V') {
        pushPoint({ x: cx, y: rel ? cy + nums[0] : nums[0] })
      } else if (C === 'C') {
        const p0 = { x: cx, y: cy }
        const p1 = { x: rel ? cx + nums[0] : nums[0], y: rel ? cy + nums[1] : nums[1] }
        const p2 = { x: rel ? cx + nums[2] : nums[2], y: rel ? cy + nums[3] : nums[3] }
        const p3 = { x: rel ? cx + nums[4] : nums[4], y: rel ? cy + nums[5] : nums[5] }
        for (const p of sampleCubic(p0, p1, p2, p3, 12)) pushPoint(p)
      } else if (C === 'Q') {
        const p0 = { x: cx, y: cy }
        const p1 = { x: rel ? cx + nums[0] : nums[0], y: rel ? cy + nums[1] : nums[1] }
        const p2 = { x: rel ? cx + nums[2] : nums[2], y: rel ? cy + nums[3] : nums[3] }
        for (const p of sampleQuad(p0, p1, p2, 10)) pushPoint(p)
      } else if (C === 'A') {
        // Approximate arcs as a line to endpoint (good enough for plotter SVG subset).
        pushPoint({ x: rel ? cx + nums[5] : nums[5], y: rel ? cy + nums[6] : nums[6] })
      } else {
        break
      }
      first = false
      if (C === 'M') continue
      // For commands that don't repeat the same arg pattern freely, break after one unless M/L
      if (C !== 'L' && C !== 'H' && C !== 'V' && C !== 'C' && C !== 'Q' && C !== 'A') break
    }
  }
  endSub()
  return polys.map((p) => densify(p, 2))
}

function parsePointsAttr(value: string, ctm: Mat): Polyline {
  const nums = value.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n))
  const pts: Polyline = []
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push(apply(ctm, { x: nums[i], y: nums[i + 1] }))
  return pts
}

function walk(node: Element, parent: Mat, out: Polylines) {
  const ctm = mul(parent, parseTransform(node.getAttribute('transform')))
  const tag = node.tagName.toLowerCase()
  if (tag === 'path' && node.getAttribute('d')) out.push(...parsePathD(node.getAttribute('d')!, ctm))
  else if (tag === 'polyline' || tag === 'polygon') {
    const pts = parsePointsAttr(node.getAttribute('points') || '', ctm)
    if (tag === 'polygon' && pts.length) pts.push({ ...pts[0] })
    if (pts.length >= 2) out.push(pts)
  } else if (tag === 'line') {
    const x1 = Number(node.getAttribute('x1') || 0), y1 = Number(node.getAttribute('y1') || 0)
    const x2 = Number(node.getAttribute('x2') || 0), y2 = Number(node.getAttribute('y2') || 0)
    out.push([apply(ctm, { x: x1, y: y1 }), apply(ctm, { x: x2, y: y2 })])
  } else if (tag === 'rect') {
    const x = Number(node.getAttribute('x') || 0), y = Number(node.getAttribute('y') || 0)
    const w = Number(node.getAttribute('width') || 0), h = Number(node.getAttribute('height') || 0)
    out.push([
      apply(ctm, { x, y }), apply(ctm, { x: x + w, y }),
      apply(ctm, { x: x + w, y: y + h }), apply(ctm, { x, y: y + h }), apply(ctm, { x, y }),
    ])
  } else if (tag === 'circle' || tag === 'ellipse') {
    const cx = Number(node.getAttribute('cx') || 0), cy = Number(node.getAttribute('cy') || 0)
    const rx = Number(node.getAttribute(tag === 'circle' ? 'r' : 'rx') || 0)
    const ry = Number(node.getAttribute(tag === 'circle' ? 'r' : 'ry') || rx)
    const pts: Polyline = []
    const n = 48
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push(apply(ctm, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }))
    }
    out.push(pts)
  }
  for (const child of Array.from(node.children)) walk(child as Element, ctm, out)
}

export function svgToPolylines(svgText: string): Polylines {
  // Prefer DOMParser in browser; fall back to extracting path-like tags via regex in Node tests.
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    if (!svg) throw new Error('No <svg> root')
    const out: Polylines = []
    walk(svg, I, out)
    if (!out.length) throw new Error('No drawable paths in SVG')
    return out
  }
  const out: Polylines = []
  const pathRe = /<path\b[^>]*\bd=["']([^"']+)["'][^>]*>/gi
  let m
  while ((m = pathRe.exec(svgText))) out.push(...parsePathD(m[1]))
  const polyRe = /<(polyline|polygon)\b[^>]*\bpoints=["']([^"']+)["'][^>]*>/gi
  while ((m = polyRe.exec(svgText))) {
    const pts = parsePointsAttr(m[2], I)
    if (m[1].toLowerCase() === 'polygon' && pts.length) pts.push({ ...pts[0] })
    if (pts.length >= 2) out.push(pts)
  }
  const lineRe = /<line\b[^>]*>/gi
  while ((m = lineRe.exec(svgText))) {
    const tag = m[0]
    const num = (name: string) => Number((tag.match(new RegExp(name + '=["\']([^"\']+)["\']')) || [])[1] || 0)
    out.push([{ x: num('x1'), y: num('y1') }, { x: num('x2'), y: num('y2') }])
  }
  const rectRe = /<rect\b[^>]*>/gi
  while ((m = rectRe.exec(svgText))) {
    const tag = m[0]
    const num = (name: string) => Number((tag.match(new RegExp(name + '=["\']([^"\']+)["\']')) || [])[1] || 0)
    const x = num('x'), y = num('y'), w = num('width'), h = num('height')
    out.push([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }])
  }
  if (!out.length) throw new Error('No drawable paths in SVG')
  return out
}
