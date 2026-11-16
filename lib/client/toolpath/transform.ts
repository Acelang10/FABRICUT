import type { FitOptions, Polylines } from './types'
import { boundsOf } from './geometry'
import { WORK_X_MAX_MM, WORK_Y_MAX_MM } from './types'

export function assertInsideWork(polys: Polylines, margin = 0, xMax = WORK_X_MAX_MM, yMax = WORK_Y_MAX_MM) {
  const b = boundsOf(polys)
  if (b.minX < -1e-6 || b.minY < -1e-6 || b.maxX > xMax + 1e-6 || b.maxY > yMax + 1e-6) {
    throw new Error(
      `Path exceeds work area (${xMax}×${yMax} mm). Bounds: [${b.minX.toFixed(2)},${b.minY.toFixed(2)}]–[${b.maxX.toFixed(2)},${b.maxY.toFixed(2)}]`,
    )
  }
  if (margin > 0) {
    if (
      b.minX < margin - 1e-6 ||
      b.minY < margin - 1e-6 ||
      b.maxX > xMax - margin + 1e-6 ||
      b.maxY > yMax - margin + 1e-6
    ) {
      throw new Error(`Path violates ${margin} mm margin inside ${xMax}×${yMax} mm work area`)
    }
  }
}

export function defaultFitOptions(): FitOptions {
  return {
    targetWidthMm: WORK_X_MAX_MM - 20,
    targetHeightMm: WORK_Y_MAX_MM - 20,
    offsetXMm: 0,
    offsetYMm: 0,
    rotationDeg: 0,
    keepAspect: true,
    marginMm: 10,
    flipY: true,
  }
}

export function fitToWork(raw: Polylines, opts: FitOptions): Polylines {
  if (!raw.length) throw new Error('Empty path')
  const b = boundsOf(raw)
  const srcW = Math.max(1e-6, b.maxX - b.minX)
  const srcH = Math.max(1e-6, b.maxY - b.minY)
  const margin = Math.max(0, opts.marginMm)
  const availW = Math.max(1e-6, opts.targetWidthMm)
  const availH = Math.max(1e-6, opts.targetHeightMm)

  let scaleX = availW / srcW
  let scaleY = availH / srcH
  if (opts.keepAspect) {
    const s = Math.min(scaleX, scaleY)
    scaleX = s
    scaleY = s
  }

  const local: Polylines = raw.map((poly) =>
    poly.map((p) => {
      let x = (p.x - b.minX) * scaleX
      let y = (p.y - b.minY) * scaleY
      if (opts.flipY !== false) y = srcH * scaleY - y
      if (opts.rotationDeg === 90) {
        const nx = y
        const ny = srcW * scaleX - x
        x = nx
        y = ny
      }
      return { x, y }
    }),
  )

  const lb = boundsOf(local)
  const out: Polylines = local.map((poly) =>
    poly.map((p) => ({
      x: p.x - lb.minX + opts.offsetXMm + margin,
      y: p.y - lb.minY + opts.offsetYMm + margin,
    })),
  )
  assertInsideWork(out, 0)
  if (margin > 0) assertInsideWork(out, margin)
  return out
}
