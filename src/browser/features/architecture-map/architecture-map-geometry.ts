// 格子か区画の組み方に置いた箱の座標。図の自然な大きさ（拡大・縮小の前）を決める。

import type { MapView, MapViewLane } from "../../../shared/architecture-map/map-view.ts"
import {
  type MapGridPlace,
  type MapFocusFrame,
  type MapLaneLayout,
  mapFocusFrameOf,
  mapLaneLayoutOf,
  mapPlacementOf,
} from "./architecture-map-placement.ts"
import { wrappedLines, wrappedTitle } from "./architecture-map-title-wrap.ts"

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

/** 区画の枠。`solo` の区画は枠を描かず、同じ座標の箱がその区画になる。 */
export type MapLaneRect = {
  readonly lane: MapViewLane
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly solo: boolean
}

/** 区画の組み方で描く箱の名前。行は2行まで折り返し済みで、名前（と summary）の塊を箱の縦の中央に置く。 */
export type MapBoxTitle = {
  readonly lines: readonly string[]
  readonly fontSize: number
  /** 区画そのものが箱になった箱。 */
  readonly solo: boolean
  readonly x: number
  /** 行ごとの字の基線の y。 */
  readonly baselines: readonly number[]
  /** 名前の下に描く summary（箱の幅で折り返し済み・字は省かない）。広げた図の箱で summary を持つときだけある。 */
  readonly summary?: {
    readonly lines: readonly string[]
    readonly baselines: readonly number[]
    readonly fontSize: number
  }
}

type TitleLayout = Pick<MapBoxTitle, "lines" | "fontSize" | "solo"> & {
  readonly summary?: readonly string[]
}

export type MapGeometry = {
  readonly width: number
  readonly height: number
  readonly rects: ReadonlyMap<string, MapBoxRect>
  /** 区画の組み方で描くときだけある。 */
  readonly lanes?: {
    readonly rects: readonly MapLaneRect[]
    readonly titles: ReadonlyMap<string, MapBoxTitle>
    /** 枠のある区画の見出しの帯の高さと字の大きさ。 */
    readonly heading: { readonly height: number; readonly fontSize: number }
  }
  /** 区画のある地図のフォーカスした図だけある。子を囲む区画の色の枠。 */
  readonly focusFrame?: {
    readonly rect: {
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
    }
    readonly lane: MapViewLane
    readonly heading: { readonly text: string; readonly height: number; readonly fontSize: number }
  }
  /** 枠の外の右に置いた外の箱の ID。 */
  readonly outerIds?: ReadonlySet<string>
  /** 区画を組まない広げた図の、折り返し済みの箱の名前と summary。 */
  readonly boxTitles?: ReadonlyMap<string, MapBoxTitle>
}

/** 名前の行の高さ（字の大きさに掛ける）。 */
const MAP_TITLE_LINE_HEIGHT = 1.3

/** 名前の最後の行と summary の最初の行のあいだ。 */
const SUMMARY_GAP = 4

type LaneMetrics = {
  /** 図の外周の余白。 */
  readonly margin: number
  /** `runtime` の列の幅。 */
  readonly column: number
  /** `external` の列の幅（中の箱の名前が2行に収まるよう広い）。 */
  readonly externalColumn: number
  readonly gap: number
  /** 枠のある区画の見出しの帯の高さ。 */
  readonly heading: number
  readonly headingFont: number
  /** 枠の内側の余白。 */
  readonly pad: number
  readonly boxGap: number
  /** 区画そのものが箱になった箱の名前の字の大きさ。 */
  readonly soloFont: number
  /** 枠の中の箱の名前の字の大きさ。 */
  readonly boxFont: number
  readonly boxPadX: number
  readonly boxPadY: number
  /** 区画の箱の最小の高さ。 */
  readonly soloMinHeight: number
  /** 箱の右端に取っておく幅（潜れる印・変えた件数）。 */
  readonly trailing: number
  /** 箱の名前の下の summary の1行の高さ。0 なら summary を描かない。 */
  readonly summaryLine: number
  readonly summaryFont: number
}

const LANE_METRICS = {
  full: {
    margin: 12,
    column: 200,
    externalColumn: 260,
    // 矢印の本数とラベルを区画のあいだに置ける幅
    gap: 40,
    heading: 26,
    headingFont: 13,
    pad: 10,
    boxGap: 10,
    soloFont: 16,
    boxFont: 14,
    boxPadX: 12,
    boxPadY: 10,
    soloMinHeight: 72,
    trailing: 18,
    summaryLine: 17,
    summaryFont: 12,
  },
  // 区画のあいだは矢印の線と矢じりが見分けられる幅
  mini: {
    margin: 4,
    column: 62,
    externalColumn: 80,
    gap: 16,
    heading: 15,
    headingFont: 9,
    pad: 5,
    boxGap: 4,
    soloFont: 10.5,
    boxFont: 9,
    boxPadX: 6,
    boxPadY: 4,
    soloMinHeight: 34,
    trailing: 0,
    summaryLine: 0,
    summaryFont: 0,
  },
  // 等倍で描く大きさ（図の座標の単位がそのまま px になる）。広げた地図の組み方を summary なしで縮めた形
  report: {
    margin: 8,
    column: 150,
    externalColumn: 190,
    gap: 28,
    heading: 22,
    headingFont: 11,
    pad: 8,
    boxGap: 8,
    soloFont: 14,
    boxFont: 13,
    boxPadX: 10,
    boxPadY: 8,
    soloMinHeight: 48,
    trailing: 22,
    summaryLine: 0,
    summaryFont: 0,
  },
} as const satisfies Record<MapDiagramForm, LaneMetrics>

const MARGIN = 12

export function mapGeometryOf(view: MapView, form: MapDiagramForm): MapGeometry {
  const layout = mapLaneLayoutOf(view)
  if (layout.kind === "lanes") {
    return laneGeometryOf(view, layout, form)
  }
  const frame = mapFocusFrameOf(view)
  return frame.kind === "none"
    ? gridGeometryOf(view, form)
    : focusFrameGeometryOf(view, frame, form)
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

/** 子を区画の色の枠で囲み、子とつながる外の箱を枠の外の右に1列で置く。 */
function focusFrameGeometryOf(
  view: MapView,
  frame: Extract<MapFocusFrame, { kind: "frame" }>,
  form: MapDiagramForm,
): MapGeometry {
  const cell = CELLS[form]
  const { margin, heading, headingFont, pad, gap } = LANE_METRICS[form]
  const childIds = new Set(frame.childIds)
  const placement = mapPlacementOf({
    ...view,
    boxes: view.boxes.filter((box) => childIds.has(box.id)),
  })
  const layouts = boxLayoutsOf(view.boxes, form)
  const rows = gridRowsOf(placement, layouts, cell, form, margin + heading + pad)
  const rects = new Map<string, MapBoxRect>()
  for (const [id, place] of placement) {
    rects.set(id, {
      id,
      x: margin + pad + place.column * (cell.width + cell.gapX),
      y: rows.ys[place.row] ?? margin + heading + pad,
      width: cell.width,
      height: rows.heights[place.row] ?? cell.height,
    })
  }
  const children = [...rects.values()]
  const rect = {
    x: margin,
    y: margin,
    width: Math.max(0, ...children.map((child) => child.x + child.width)) + pad - margin,
    height: Math.max(0, ...children.map((child) => child.y + child.height)) + pad - margin,
  }
  const outerX = rect.x + rect.width + gap
  const outerHeights = frame.outerIds.map((id) => {
    const layout = layouts.get(id)
    return Math.max(
      cell.height,
      layout === undefined ? 0 : titleBlockHeight(layout, LANE_METRICS[form]),
    )
  })
  for (const [index, id] of frame.outerIds.entries()) {
    rects.set(id, {
      id,
      x: outerX,
      y: rect.y + outerHeights.slice(0, index).reduce((sum, height) => sum + height + cell.gapY, 0),
      width: cell.width,
      height: outerHeights[index] ?? cell.height,
    })
  }
  const all = [...rects.values()]
  return {
    ...boxTitlesOf(layouts, rects, form),
    width: (frame.outerIds.length === 0 ? rect.x + rect.width : outerX + cell.width) + margin,
    height: Math.max(rect.y + rect.height, ...all.map((box) => box.y + box.height)) + margin,
    rects,
    focusFrame: {
      rect,
      lane: frame.lane,
      heading: { text: `${frame.title}の中`, height: heading, fontSize: headingFont },
    },
    outerIds: new Set(frame.outerIds),
  }
}

function laneGeometryOf(
  view: MapView,
  layout: Extract<MapLaneLayout, { kind: "lanes" }>,
  form: MapDiagramForm,
): MapGeometry {
  const metrics: LaneMetrics = LANE_METRICS[form]
  const { margin } = metrics
  const boxesById = new Map(view.boxes.map((box) => [box.id, box]))
  const columnWidths = layout.columns.map((kind) =>
    kind === "runtime" ? metrics.column : metrics.externalColumn,
  )
  const columnXs = columnWidths.map(
    (_, index) =>
      margin + columnWidths.slice(0, index).reduce((sum, width) => sum + width + metrics.gap, 0),
  )
  const plans = layout.cells.map((cell) => {
    const width = spanLength(columnWidths, cell.column, cell.columnSpan, metrics.gap)
    if (cell.solo) {
      const id = cell.boxIds[0] ?? ""
      const box = boxesById.get(id)
      const title = titleLayoutOf(form, width, true, box?.title ?? id, box?.summary)
      return {
        cell,
        width,
        need: Math.max(metrics.soloMinHeight, titleBlockHeight(title, metrics)),
        titles: [[id, title] as const],
        boxHeight: 0,
      }
    }
    const innerWidth = width - metrics.pad * 2
    const titles = cell.boxIds.map((id) => {
      const title: TitleLayout = {
        lines: titleLinesOf(boxesById.get(id)?.title ?? id, innerWidth, metrics.boxFont, form),
        fontSize: metrics.boxFont,
        solo: false,
      }
      return [id, title] as const
    })
    const lineCount = Math.max(1, ...titles.map(([, title]) => title.lines.length))
    const boxHeight = metrics.boxPadY * 2 + lineCount * metrics.boxFont * MAP_TITLE_LINE_HEIGHT
    const need =
      metrics.heading +
      metrics.pad +
      cell.boxIds.length * boxHeight +
      Math.max(0, cell.boxIds.length - 1) * metrics.boxGap
    return { cell, width, need, titles, boxHeight }
  })

  const rowHeights = Array.from({ length: layout.rowCount }, (_, row) =>
    Math.max(
      metrics.soloMinHeight,
      ...plans
        .filter((plan) => plan.cell.row === row && plan.cell.rowSpan === 1)
        .map((plan) => plan.need),
    ),
  )
  // 縦に通す区画が行の合計より高ければ、足りない分を最初の行に足す
  const shortfall = Math.max(
    0,
    ...plans
      .filter((plan) => plan.cell.rowSpan > 1)
      .map(
        (plan) => plan.need - spanLength(rowHeights, plan.cell.row, plan.cell.rowSpan, metrics.gap),
      ),
  )
  const heights = rowHeights.map((height, row) => (row === 0 ? height + shortfall : height))
  const rowYs = heights.map(
    (_, index) =>
      margin + heights.slice(0, index).reduce((sum, height) => sum + height + metrics.gap, 0),
  )

  const laneRects: MapLaneRect[] = []
  const rects = new Map<string, MapBoxRect>()
  const titles = new Map<string, MapBoxTitle>()
  for (const plan of plans) {
    const { cell } = plan
    const x = columnXs[cell.column] ?? margin
    const y = rowYs[cell.row] ?? margin
    const height = spanLength(heights, cell.row, cell.rowSpan, metrics.gap)
    laneRects.push({ lane: cell.lane, x, y, width: plan.width, height, solo: cell.solo })
    const boxRects = cell.solo
      ? cell.boxIds.map((id) => ({ id, x, y, width: plan.width, height }))
      : cell.boxIds.map((id, index) => ({
          id,
          x: x + metrics.pad,
          y: y + metrics.heading + index * (plan.boxHeight + metrics.boxGap),
          width: plan.width - metrics.pad * 2,
          height: plan.boxHeight,
        }))
    for (const rect of boxRects) {
      rects.set(rect.id, rect)
    }
    for (const [id, title] of plan.titles) {
      const rect = rects.get(id)
      if (rect !== undefined) {
        titles.set(id, placedTitle(title, rect, metrics))
      }
    }
  }
  const lastColumn = columnXs.length - 1
  const lastRow = rowYs.length - 1
  return {
    width: (columnXs[lastColumn] ?? margin) + (columnWidths[lastColumn] ?? 0) + margin,
    height: (rowYs[lastRow] ?? margin) + (heights[lastRow] ?? 0) + margin,
    rects,
    lanes: {
      rects: laneRects,
      titles,
      heading: { height: metrics.heading, fontSize: metrics.headingFont },
    },
  }
}

/** `start` から `count` 個の列（行）を、あいだの `gap` ごと通した長さ。 */
function spanLength(sizes: readonly number[], start: number, count: number, gap: number): number {
  return sizes.slice(start, start + count).reduce((sum, size) => sum + size, 0) + gap * (count - 1)
}

/** 名前の行。広げた図は字を省かずに折り返し、ほかの形は2行で切る。 */
function titleLinesOf(
  title: string,
  width: number,
  fontSize: number,
  form: MapDiagramForm,
): readonly string[] {
  const metrics = LANE_METRICS[form]
  const units = (width - metrics.boxPadX * 2 - metrics.trailing) / fontSize
  return form === "full" ? wrappedLines(title, units) : wrappedTitle(title, units)
}

function titleLayoutOf(
  form: MapDiagramForm,
  width: number,
  solo: boolean,
  title: string,
  summary?: string,
): TitleLayout {
  const metrics = LANE_METRICS[form]
  const fontSize = solo ? metrics.soloFont : metrics.boxFont
  const summaryLines =
    metrics.summaryLine > 0 && summary !== undefined
      ? wrappedLines(summary, (width - metrics.boxPadX * 2) / metrics.summaryFont)
      : undefined
  return {
    lines: titleLinesOf(title, width, fontSize, form),
    fontSize,
    solo,
    ...(summaryLines === undefined ? {} : { summary: summaryLines }),
  }
}

/** 名前と summary の塊の高さ（箱の上下の余白は含まない）。 */
function titleContentHeight(title: TitleLayout, metrics: LaneMetrics): number {
  const names = title.lines.length * title.fontSize * MAP_TITLE_LINE_HEIGHT
  return title.summary === undefined
    ? names
    : names + SUMMARY_GAP + title.summary.length * metrics.summaryLine
}

/** 名前と summary を収める箱の高さ。 */
function titleBlockHeight(title: TitleLayout, metrics: LaneMetrics): number {
  return metrics.boxPadY * 2 + titleContentHeight(title, metrics)
}

function placedTitle(title: TitleLayout, rect: MapBoxRect, metrics: LaneMetrics): MapBoxTitle {
  const lineHeight = title.fontSize * MAP_TITLE_LINE_HEIGHT
  const block = titleContentHeight(title, metrics)
  const top = rect.y + (rect.height - block) / 2
  // 行の高さの中央から字の大きさの 0.35 下が、和文と欧文の字面がおおよそ中央にそろう基線
  const baselines = title.lines.map(
    (_, index) => top + (index + 0.5) * lineHeight + title.fontSize * 0.35,
  )
  const lastLine = top + title.lines.length * lineHeight
  return {
    lines: title.lines,
    fontSize: title.fontSize,
    solo: title.solo,
    x: rect.x + metrics.boxPadX,
    baselines,
    ...(title.summary === undefined
      ? {}
      : {
          summary: {
            lines: title.summary,
            baselines: title.summary.map(
              (_, index) =>
                lastLine +
                SUMMARY_GAP +
                (index + 0.5) * metrics.summaryLine +
                metrics.summaryFont * 0.35,
            ),
            fontSize: metrics.summaryFont,
          },
        }),
  }
}

function gridGeometryOf(view: MapView, form: MapDiagramForm): MapGeometry {
  const cell = CELLS[form]
  const placement = mapPlacementOf(view)
  const layouts = boxLayoutsOf(view.boxes, form)
  const rows = gridRowsOf(placement, layouts, cell, form, MARGIN)
  const rects = new Map<string, MapBoxRect>()
  for (const [id, place] of placement) {
    rects.set(id, {
      id,
      x: MARGIN + place.column * (cell.width + cell.gapX),
      y: rows.ys[place.row] ?? MARGIN,
      width: cell.width,
      height: rows.heights[place.row] ?? cell.height,
    })
  }
  const all = [...rects.values()]
  return {
    width: Math.max(0, ...all.map((rect) => rect.x + rect.width)) + MARGIN,
    height: Math.max(0, ...all.map((rect) => rect.y + rect.height)) + MARGIN,
    rects,
    ...boxTitlesOf(layouts, rects, form),
  }
}

/** 広げた図の箱ごとの名前と summary の組み方。ほかの形では空（図の部品が名前を短く切って描く）。 */
function boxLayoutsOf(
  boxes: readonly MapView["boxes"][number][],
  form: MapDiagramForm,
): ReadonlyMap<string, TitleLayout> {
  if (form !== "full") {
    return new Map()
  }
  const { width } = CELLS[form]
  return new Map(
    boxes.map((box) => [box.id, titleLayoutOf(form, width, false, box.title, box.summary)]),
  )
}

/** 格子の行ごとの高さ（行の中でいちばん背の高い箱に合わせる）と上端の y。 */
function gridRowsOf(
  placement: ReadonlyMap<string, MapGridPlace>,
  layouts: ReadonlyMap<string, TitleLayout>,
  cell: Cell,
  form: MapDiagramForm,
  top: number,
): { readonly heights: readonly number[]; readonly ys: readonly number[] } {
  const metrics = LANE_METRICS[form]
  const rowCount = Math.max(0, ...[...placement.values()].map((place) => place.row + 1))
  const heights = Array.from({ length: rowCount }, (_, row) =>
    Math.max(
      cell.height,
      ...[...placement]
        .filter(([, place]) => place.row === row)
        .map(([id]) => {
          const layout = layouts.get(id)
          return layout === undefined ? 0 : titleBlockHeight(layout, metrics)
        }),
    ),
  )
  const ys = heights.map(
    (_, index) =>
      top + heights.slice(0, index).reduce((sum, height) => sum + height + cell.gapY, 0),
  )
  return { heights, ys }
}

function boxTitlesOf(
  layouts: ReadonlyMap<string, TitleLayout>,
  rects: ReadonlyMap<string, MapBoxRect>,
  form: MapDiagramForm,
): Pick<MapGeometry, "boxTitles"> {
  if (layouts.size === 0) {
    return {}
  }
  const titles = new Map<string, MapBoxTitle>()
  for (const [id, layout] of layouts) {
    const rect = rects.get(id)
    if (rect !== undefined) {
      titles.set(id, placedTitle(layout, rect, LANE_METRICS[form]))
    }
  }
  return { boxTitles: titles }
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
