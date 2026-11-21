import type { FitOptions, Polylines, WorkBox } from './types'
import { boundsOf } from './geometry'
import { WORK_X_MAX_MM, WORK_Y_MAX_MM } from './types'

export function machineWorkBox(): WorkBox {
  return { x0: 0, x1: WORK_X_MAX_MM, y0: 0, y1: WORK_Y_MAX_MM }
}

function num(v: number | undefined, fallback: number) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function workBoxOf(opts: FitOptions): WorkBox {
  const box = machineWorkBox()
  return {
    x0: num(opts.workX0, box.x0),
    x1: num(opts.workX1, box.x1),
    y0: num(opts.workY0, box.y0),
    y1: num(opts.workY1, box.y1),
  }
}

/** Largest width (X) and length (Y) that still sit inside the saved limit, after the margin. */
export function maxSizeForLimit(box: WorkBox, marginMm: number) {
  const margin = Math.max(0, marginMm)
  const width = Math.round(Math.max(1, box.x1 - box.x0 - 2 * margin) * 10) / 10
  const length = Math.round(Math.max(1, box.y1 - box.y0 - 2 * margin) * 10) / 10
  return { targetWidthMm: width, targetHeightMm: length, offsetXMm: box.x0, offsetYMm: box.y0 }
}

export function assertInsideWork(
  polys: Polylines,
  margin = 0,
  xMax = WORK_X_MAX_MM,
  yMax = WORK_Y_MAX_MM,
  xMin = 0,
  yMin = 0,
) {
  const b = boundsOf(polys)
  const spanX = Math.round((xMax - xMin) * 10) / 10
  const spanY = Math.round((yMax - yMin) * 10) / 10
  if (b.minX < xMin - 1e-6 || b.minY < yMin - 1e-6 || b.maxX > xMax + 1e-6 || b.maxY > yMax + 1e-6) {
    throw new Error(
      `Path exceeds work area (${spanX}×${spanY} mm). Bounds: [${b.minX.toFixed(2)},${b.minY.toFixed(2)}]–[${b.maxX.toFixed(2)},${b.maxY.toFixed(2)}]`,
    )
  }
  if (margin > 0) {
    if (
      b.minX < xMin + margin - 1e-6 ||
      b.minY < yMin + margin - 1e-6 ||
      b.maxX > xMax - margin + 1e-6 ||
      b.maxY > yMax - margin + 1e-6
    ) {
      throw new Error(`Path violates ${margin} mm margin inside ${spanX}×${spanY} mm work area`)
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
  const box = workBoxOf(opts)
  assertInsideWork(out, 0, box.x1, box.y1, box.x0, box.y0)
  if (margin > 0) assertInsideWork(out, margin, box.x1, box.y1, box.x0, box.y0)
  return out
}
