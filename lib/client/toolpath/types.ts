export type Point = { x: number; y: number }
export type Polyline = Point[]
export type Polylines = Polyline[]

export const WORK_X_MAX_MM = 444.5
export const WORK_Y_MAX_MM = 650
export const DEFAULT_FEED_MM_PER_MIN = 200
export const DEFAULT_TRAVEL_FEED = 400

export type FitOptions = {
  targetWidthMm: number
  targetHeightMm: number
  offsetXMm: number
  offsetYMm: number
  rotationDeg: 0 | 90
  keepAspect: boolean
  marginMm: number
  flipY?: boolean // SVG y-down -> machine y-up style if needed; default flip for SVG
  /** Saved work box. Width and length are fitted inside it. Defaults to 0..bed. */
  workX0?: number
  workX1?: number
  workY0?: number
  workY1?: number
}

export type WorkBox = { x0: number; x1: number; y0: number; y1: number }

export type PathStats = {
  lengthMm: number
  travelMm: number
  estimateMin: number
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}
