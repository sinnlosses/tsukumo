// 折り返し配置の図の形（箱・線・囲み）と、配置と描画が共有する字の寸法。

import type { GraphChange, GraphNodeShape, GraphTone } from "./graph-source.ts"

export type FoldBox = {
  readonly node: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly shape: GraphNodeShape
  readonly tone: GraphTone
  readonly change: GraphChange
  readonly lines: readonly string[]
  readonly notes: readonly string[]
}

export type FoldPath = {
  readonly points: readonly (readonly [number, number])[]
  readonly label: readonly string[]
  /** ラベルの1行目の基線の位置と寄せ方。 */
  readonly labelX: number
  readonly labelY: number
  readonly labelAnchor: "start" | "middle" | "end"
  readonly returns: boolean
  readonly dashed: boolean
  readonly tone: GraphTone
  readonly change: GraphChange
}

/** 群の囲み。群が行をまたぐと行ごとに分かれ、題は最初の囲みにだけ付く。 */
export type FoldFrame = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly title: string
  readonly tone: GraphTone
  /** 色の目印の無い群に順に当てる地の色の番号（1〜3）。目印があれば 0。 */
  readonly ground: number
}

export type GraphFoldFigure = {
  readonly width: number
  readonly height: number
  readonly boxes: readonly FoldBox[]
  readonly paths: readonly FoldPath[]
  readonly frames: readonly FoldFrame[]
}

/** 節点ごとの折った字と、どの節点にも揃える箱の寸法・列のあいだ。 */
export type FoldMetrics = {
  readonly boxWidth: number
  readonly boxHeight: number
  readonly gap: number
  readonly lines: readonly (readonly string[])[]
  readonly notes: readonly (readonly string[])[]
}

/** 節点の置き場。`side` は主経路の節点の上の段。 */
export type FoldSlot = {
  readonly row: number
  readonly column: number
  readonly side: boolean
}

export const LABEL_FONT_SIZE = 14
export const NOTE_FONT_SIZE = 12
export const EDGE_FONT_SIZE = 12
export const LABEL_LINE_HEIGHT = 18
export const NOTE_LINE_HEIGHT = 16
export const EDGE_LINE_HEIGHT = 15
/** 群の題を置く高さ。 */
export const FRAME_TITLE = 18
export const FRAME_PAD = 8

export const emptyBox: FoldBox = {
  node: -1,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  shape: "box",
  tone: "none",
  change: "unchanged",
  lines: [],
  notes: [],
}
