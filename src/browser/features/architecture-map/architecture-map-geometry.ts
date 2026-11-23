// 格子に置いた箱の座標。図の自然な大きさ（拡大・縮小の前）を決める。

import type { MapView } from "../../../shared/architecture-map/map-view.ts"
import { type MapGridPlace, mapPlacementOf } from "./architecture-map-placement.ts"

/** full は広げた地図、mini はサイドバーの地図、report はレポートのミニマップ。 */
export type MapDiagramForm = "full" | "mini" | "report"

type Cell = {
  readonly width: number
  readonly height: number
  readonly gapX: number
  readonly gapY: number
}

const CELLS = {
  full: { width: 220, height: 64, gapX: 72, gapY: 28 },
  mini: { width: 84, height: 22, gapX: 16, gapY: 8 },
  report: { width: 104, height: 22, gapX: 16, gapY: 8 },
} as const satisfies Record<MapDiagramForm, Cell>

export type MapBoxRect = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type MapGeometry = {
  readonly width: number
  readonly height: number
  readonly rects: ReadonlyMap<string, MapBoxRect>
}

const MARGIN = 12

export function mapGeometryOf(view: MapView, form: MapDiagramForm): MapGeometry {
  const cell = CELLS[form]
  const placement = mapPlacementOf(view)
  const rects = new Map<string, MapBoxRect>()
  for (const [id, place] of placement) {
    rects.set(id, rectOf(id, place, cell))
  }
  const all = [...rects.values()]
  return {
    width: Math.max(0, ...all.map((rect) => rect.x + rect.width)) + MARGIN,
    height: Math.max(0, ...all.map((rect) => rect.y + rect.height)) + MARGIN,
    rects,
  }
}

/** 2つの箱の中心を結ぶ線が、それぞれの縁と交わる点。 */
export function edgeEndsOf(
  from: MapBoxRect,
  to: MapBoxRect,
): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } {
  const start = borderPoint(from, centerOf(to))
  const end = borderPoint(to, centerOf(from))
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

function centerOf(rect: MapBoxRect): { readonly x: number; readonly y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function borderPoint(
  rect: MapBoxRect,
  toward: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const center = centerOf(rect)
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  if (dx === 0 && dy === 0) {
    return center
  }
  const scale = Math.min(
    dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy),
  )
  return { x: center.x + dx * scale, y: center.y + dy * scale }
}

function rectOf(id: string, place: MapGridPlace, cell: Cell): MapBoxRect {
  return {
    id,
    x: MARGIN + place.column * (cell.width + cell.gapX),
    y: MARGIN + place.row * (cell.height + cell.gapY),
    width: cell.width,
    height: cell.height,
  }
}
