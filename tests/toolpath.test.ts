import test from 'node:test'
import assert from 'node:assert/strict'
import {
  svgToPolylines, parsePathD, rasterToPolylines, thresholdMask, maskToPolylines,
  fitToWork, assertInsideWork, polylinesToGcode, pathStats, WORK_X_MAX_MM, WORK_Y_MAX_MM,
  defaultFitOptions,
} from '../lib/client/toolpath'

test('SVG path/line/rect flatten to polylines', () => {
  const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">
    <rect x="10" y="10" width="40" height="20"/>
    <line x1="0" y1="0" x2="10" y2="0"/>
    <path d="M0 0 L20 0 L20 10 Z"/>
  </svg>`
  const polys = svgToPolylines(svg)
  assert.ok(polys.length >= 3)
  assert.ok(polys.some((p) => p.length >= 2))
})

test('parsePathD cubic produces multiple points', () => {
  const polys = parsePathD('M0 0 C10 0 10 10 0 10')
  assert.equal(polys.length, 1)
  assert.ok(polys[0].length > 4)
})

test('raster threshold + marching squares on synthetic square', () => {
  const w = 32, h = 32
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const ink = x >= 8 && x <= 24 && y >= 8 && y <= 24
    const v = ink ? 0 : 255
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v
    rgba[i + 3] = 255
  }
  const mask = thresholdMask(rgba, w, h, 128)
  assert.equal(mask[8 * w + 8], 1)
  assert.equal(mask[0], 0)
  const polys = maskToPolylines(mask, w, h, 0.5)
  assert.ok(polys.length >= 1, 'expected at least one contour')
  const traced = rasterToPolylines(rgba, w, h, { threshold: 128 })
  assert.ok(traced.length >= 1)
})

test('fitToWork scales into 444.5 x 650 and rejects overflow', () => {
  const raw = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }]]
  const opts = defaultFitOptions()
  const fitted = fitToWork(raw, opts)
  assertInsideWork(fitted, opts.marginMm)
  const bStats = pathStats(fitted)
  assert.ok(bStats.bounds.maxX <= WORK_X_MAX_MM + 1e-6)
  assert.ok(bStats.bounds.maxY <= WORK_Y_MAX_MM + 1e-6)

  assert.throws(() =>
    fitToWork(raw, { ...opts, offsetXMm: 400, targetWidthMm: 100, marginMm: 10, keepAspect: false }),
  )
})

test('G-code uses G0/G1/M3/M5 matching firmware subset', () => {
  const polys = [[{ x: 1, y: 2 }, { x: 3, y: 4 }]]
  const lines = polylinesToGcode(polys, { feed: 200 })
  assert.ok(lines.some((l) => l.startsWith('M5')))
  assert.ok(lines.some((l) => l.startsWith('M3')))
  assert.ok(lines.some((l) => l.startsWith('G0 ')))
  assert.ok(lines.some((l) => l.startsWith('G1 ')))
  assert.ok(lines.every((l) => !/MOVE|F1 /.test(l)))
})

test('laser G-code: M5 before every G0, M3 only before G1 runs, no Z, ends with M5', () => {
  const polys = [
    [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 4 }],
    [{ x: 10, y: 10 }, { x: 20, y: 10 }],
  ]
  const lines = polylinesToGcode(polys, { feed: 200 })
  assert.ok(lines.every((l) => !/\bZ/.test(l)), 'no Z words')
  assert.equal(lines.at(-1), 'M5')
  let laser = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l === 'M3') laser = true
    if (l === 'M5') laser = false
    if (l.startsWith('G0 ')) assert.equal(laser, false, `travel with laser on at line ${i}: ${l}`)
    if (l.startsWith('G1 ')) assert.equal(laser, true, `cut with laser off at line ${i}: ${l}`)
  }
  assert.equal(lines.filter((l) => l === 'M3').length, 2)
})
