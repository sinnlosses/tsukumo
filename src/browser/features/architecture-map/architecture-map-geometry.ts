// 格子か区画の組み方に置いた箱の座標。図の自然な大きさ（拡大・縮小の前）を決める。

import type { MapView, MapViewLane } from "../../../shared/architecture-map/map-view.ts"
import {
  type MapGridPlace,
  type MapLaneLayout,
  mapLaneLayoutOf,
  mapPlacementOf,
} from "./architecture-map-placement.ts"

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
  /** 名前の下に1行描く summary（箱の幅で切り済み）。広げた図の区画の箱で summary を持つときだけある。 */
  readonly summary?: { readonly text: string; readonly baseline: number; readonly fontSize: number }
}

type TitleLayout = Pick<MapBoxTitle, "lines" | "fontSize" | "solo"> & {
  readonly summary?: string
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
}

/** 名前の行の高さ（字の大きさに掛ける）。 */
const MAP_TITLE_LINE_HEIGHT = 1.3

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
  /** 区画の箱の名前の下の summary の行の高さ。0 なら summary を描かない。 */
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
    summaryLine: 22,
    summaryFont: 12,
  },
  mini: {
    margin: 4,
    column: 66,
    externalColumn: 86,
    gap: 6,
    heading: 16,
    headingFont: 10.5,
    pad: 5,
    boxGap: 5,
    soloFont: 13,
    boxFont: 11,
    boxPadX: 6,
    boxPadY: 4,
    soloMinHeight: 44,
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

/** 半角の字の幅（全角を1とした割合）。 */
const HALF_WIDTH = 0.55

const MARGIN = 12

export function mapGeometryOf(view: MapView, form: MapDiagramForm): MapGeometry {
  const layout = mapLaneLayoutOf(view)
  return layout.kind === "grid" ? gridGeometryOf(view, form) : laneGeometryOf(view, layout, form)
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

/**
 * 名前を、1行に `units` 字（全角を1、半角を 0.55 と数える）までで2行に折り返す。
 * 収まらないときだけ2行目の末尾を「…」で切る。半角の語は、行に入る範囲の空白か「-」の後ろで折る。
 */
function wrappedTitle(text: string, units: number): readonly string[] {
  const chars = [...text]
  const first = lineStartSafe(chars, wordBreakOf(chars, fittingLength(chars, units)))
  const head = chars.slice(0, first).join("").trimEnd()
  const tail = chars.slice(first).join("")
  return tail === "" ? [head] : [head, fittedLine(tail, units)]
}

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0
  return code <= 0xff || (code >= 0xff61 && code <= 0xff9f) ? HALF_WIDTH : 1
}

/** 先頭から `units` に収まる字の数。1字も収まらなくても1字は返す。 */
function fittingLength(chars: readonly string[], units: number): number {
  let used = 0
  for (const [index, char] of chars.entries()) {
    used += charWidth(char)
    if (used > units) {
      return Math.max(1, index)
    }
  }
  return chars.length
}

/** 行頭に置けない字（長音・小書きの仮名・句読点・閉じ括弧）。 */
const NO_LINE_START =
  /[ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ、。，．・：；！？）」』】〉》]/u

/** 2行目の頭が行頭に置けない字なら、その前で折る（1行目が空になるところまでは戻さない）。 */
function lineStartSafe(chars: readonly string[], fit: number): number {
  let index = fit
  while (index > 1 && index < chars.length && NO_LINE_START.test(chars[index] ?? "")) {
    index -= 1
  }
  return index
}

/** 半角の語の途中で切れるなら、収まる範囲の最後の空白か「-」の後ろまで戻す。 */
function wordBreakOf(chars: readonly string[], fit: number): number {
  if (fit >= chars.length || !isWordChar(chars[fit - 1]) || !isWordChar(chars[fit])) {
    return fit
  }
  for (let index = fit - 1; index > 0; index -= 1) {
    const char = chars[index - 1]
    if (char === " " || char === "-") {
      return index
    }
    if (!isWordChar(char)) {
      return fit
    }
  }
  return fit
}

function isWordChar(char?: string): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char)
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
      const lines = wrappedTitle(
        box?.title ?? id,
        (width - metrics.boxPadX * 2 - metrics.trailing) / metrics.soloFont,
      )
      const summary =
        metrics.summaryLine > 0 && box?.summary !== undefined
          ? fittedLine(box.summary, (width - metrics.boxPadX * 2) / metrics.summaryFont)
          : undefined
      const need =
        metrics.boxPadY * 2 +
        lines.length * metrics.soloFont * MAP_TITLE_LINE_HEIGHT +
        (summary === undefined ? 0 : metrics.summaryLine)
      const title: TitleLayout = {
        lines,
        fontSize: metrics.soloFont,
        solo: true,
        ...(summary === undefined ? {} : { summary }),
      }
      return {
        cell,
        width,
        need: Math.max(metrics.soloMinHeight, need),
        titles: [[id, title] as const],
        boxHeight: 0,
      }
    }
    const innerWidth = width - metrics.pad * 2
    const titles = cell.boxIds.map((id) => {
      const lines = wrappedTitle(
        boxesById.get(id)?.title ?? id,
        (innerWidth - metrics.boxPadX * 2 - metrics.trailing) / metrics.boxFont,
      )
      const title: TitleLayout = { lines, fontSize: metrics.boxFont, solo: false }
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

function placedTitle(title: TitleLayout, rect: MapBoxRect, metrics: LaneMetrics): MapBoxTitle {
  const lineHeight = title.fontSize * MAP_TITLE_LINE_HEIGHT
  const block =
    title.lines.length * lineHeight + (title.summary === undefined ? 0 : metrics.summaryLine)
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
            text: title.summary,
            baseline: lastLine + metrics.summaryLine * 0.7,
            fontSize: metrics.summaryFont,
          },
        }),
  }
}

/** 1行に `units` 字までで切り、収まらないときは末尾を「…」にする。 */
function fittedLine(text: string, units: number): string {
  const chars = [...text]
  const fit = fittingLength(chars, units)
  return fit >= chars.length ? text : `${chars.slice(0, fittingLength(chars, units - 1)).join("")}…`
}

function gridGeometryOf(view: MapView, form: MapDiagramForm): MapGeometry {
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
