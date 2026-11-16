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
}

export type PathStats = {
  lengthMm: number
  travelMm: number
  estimateMin: number
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}
