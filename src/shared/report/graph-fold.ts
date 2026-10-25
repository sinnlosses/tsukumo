// 主経路が長い `graph` を、行を折り返す配置に回すかを決め、1行の数を選ぶ。
// 置けない図は `undefined` を返し、呼ぶ側が mermaid の flowchart に回す。

import {
  LABEL_FONT_SIZE,
  LABEL_LINE_HEIGHT,
  NOTE_FONT_SIZE,
  NOTE_LINE_HEIGHT,
  EDGE_FONT_SIZE,
  type FoldMetrics,
  type GraphFoldFigure,
} from "./graph-fold-figure.ts"
import { laidOut } from "./graph-fold-layout.ts"
import { textWidth, wrapped } from "./graph-fold-text.ts"
import { readGraphSource, type GraphSourceReading } from "./graph-source.ts"

/** 主経路の節点がこの数以上の図だけを折り返す。少ない図は mermaid のままのほうが読める。 */
const FOLD_MIN_MAIN_NODES = 6

/**
 * 行の数を選ぶときに見込む器の寸法（1440x900 の窓のレポートの幅と、図の高さの上限）。
 * 図は縦横比を保ってこの中に収まるよう縮むので、縮みがいちばん小さい行の数を採る。
 */
const FIT_WIDTH = 630
const FIT_HEIGHT = 340

/** viewBox の幅の上限。これより広くなる行の数は採らない。 */
const FOLD_MAX_WIDTH = 1000

const BOX_PADDING_X = 12
const BOX_PADDING_Y = 10
const BOX_MIN_WIDTH = 96
const BOX_MAX_TEXT_WIDTH = 120
const COLUMN_GAP_MIN = 64
const COLUMN_GAP_MAX = 132
const MIN_PER_ROW = 3
const MAX_PER_ROW = 6

/** 主経路が長く、置ける図の座標。当たらなければ `undefined`。 */
export function graphFoldFigure(source: string): GraphFoldFigure | undefined {
  const reading = readGraphSource(source)
  const main = mainPathOf(reading)
  if (main === undefined || main.length < FOLD_MIN_MAIN_NODES) {
    return undefined
  }
  const anchors = sideAnchorsOf(reading, main)
  if (anchors === undefined) {
    return undefined
  }
  const metrics = metricsOf(reading, main)
  const candidates = Array.from({ length: Math.ceil(main.length / MIN_PER_ROW) }, (_, index) =>
    Math.ceil(main.length / (index + 2)),
  )
    .filter((perRow) => perRow >= MIN_PER_ROW && perRow <= MAX_PER_ROW)
    .flatMap((perRow) => {
      const figure = laidOut(reading, main, anchors, metrics, perRow)
      return figure === undefined || figure.width > FOLD_MAX_WIDTH ? [] : [figure]
    })
  // 器に縦横比を保って収めたときに、字がいちばん大きく見える行の数を採る。
  return candidates.reduce<GraphFoldFigure | undefined>(
    (best, figure) => (best === undefined || fitScale(figure) > fitScale(best) ? figure : best),
    undefined,
  )
}

/** 図を器に縦横比を保って収めたときの縮尺。 */
function fitScale({ width, height }: GraphFoldFigure): number {
  return Math.min(FIT_WIDTH / width, FIT_HEIGHT / height)
}

/**
 * 戻り道でない辺で辿る最長の一本道（節点の添字の並び）。戻り道でない辺が輪になっていれば `undefined`。
 * 同じ長さなら、先に書いた節点を採る。
 */
function mainPathOf({ nodes, edges }: GraphSourceReading): readonly number[] | undefined {
  const forward = edges.filter((edge) => !edge.returns && edge.from !== edge.to)
  const indegree = nodes.map((_, at) => forward.filter((edge) => edge.to === at).length)
  const order: number[] = []
  const ready = nodes.flatMap((_, at) => (indegree[at] === 0 ? [at] : []))
  const remaining = [...indegree]
  while (ready.length > 0) {
    const at = ready.shift()
    if (at === undefined) {
      break
    }
    order.push(at)
    for (const edge of forward.filter((e) => e.from === at)) {
      const left = (remaining[edge.to] ?? 0) - 1
      remaining[edge.to] = left
      if (left === 0) {
        ready.push(edge.to)
        ready.sort((a, b) => a - b)
      }
    }
  }
  if (order.length !== nodes.length) {
    return undefined
  }
  const length = nodes.map(() => 1)
  const previous = nodes.map(() => -1)
  for (const at of order) {
    for (const edge of forward.filter((e) => e.from === at)) {
      const candidate = (length[at] ?? 1) + 1
      const current = length[edge.to] ?? 1
      const earlier = previous[edge.to] ?? -1
      if (candidate > current || (candidate === current && earlier >= 0 && at < earlier)) {
        length[edge.to] = candidate
        previous[edge.to] = at
      }
    }
  }
  const longest = Math.max(...length)
  const end = length.indexOf(longest)
  const path: number[] = []
  for (let at = end; at >= 0; at = previous[at] ?? -1) {
    path.unshift(at)
  }
  return path
}

/**
 * 主経路に無い節点ごとの、上の段に置く先の主経路の節点（最初につながる辺の相手）。
 * 主経路に無い節点どうしの辺・どこにもつながらない節点・同じ節点の上の取り合いがあれば `undefined`。
 */
function sideAnchorsOf(
  { nodes, edges }: GraphSourceReading,
  main: readonly number[],
): ReadonlyMap<number, number> | undefined {
  const onMain = new Set(main)
  const anchors = new Map<number, number>()
  for (const [at] of nodes.entries()) {
    if (onMain.has(at)) {
      continue
    }
    const touching = edges.filter((edge) => edge.from === at || edge.to === at)
    const [first] = touching
    if (
      first === undefined ||
      touching.some((edge) => !onMain.has(edge.from === at ? edge.to : edge.from))
    ) {
      return undefined
    }
    const anchor = first.from === at ? first.to : first.from
    if ([...anchors.values()].includes(anchor)) {
      return undefined
    }
    anchors.set(at, anchor)
  }
  return anchors
}

function metricsOf({ nodes, edges }: GraphSourceReading, main: readonly number[]): FoldMetrics {
  const widest = Math.max(
    ...nodes.map((node) =>
      Math.max(textWidth(node.name, LABEL_FONT_SIZE), textWidth(node.note, NOTE_FONT_SIZE)),
    ),
  )
  const textMax = Math.min(widest, BOX_MAX_TEXT_WIDTH)
  const lines = nodes.map((node) => wrapped(node.name, LABEL_FONT_SIZE, textMax))
  const notes = nodes.map((node) =>
    node.note === "" ? [] : wrapped(node.note, NOTE_FONT_SIZE, textMax),
  )
  const boxHeight = Math.max(
    ...nodes.map(
      (_, at) =>
        BOX_PADDING_Y * 2 +
        (lines[at]?.length ?? 1) * LABEL_LINE_HEIGHT +
        (notes[at]?.length ?? 0) * NOTE_LINE_HEIGHT,
    ),
  )
  // 列のあいだに入るのは主経路の隣どうしの辺のラベルだけ。収まらなければ2行に折る。
  const labelWidest = Math.max(
    0,
    ...edges
      .filter((edge) => main.indexOf(edge.to) - main.indexOf(edge.from) === 1 && !edge.returns)
      .map((edge) => textWidth(edge.label, EDGE_FONT_SIZE)),
  )
  return {
    boxWidth: Math.max(BOX_MIN_WIDTH, Math.ceil(textMax) + BOX_PADDING_X * 2),
    boxHeight,
    gap: Math.min(COLUMN_GAP_MAX, Math.max(COLUMN_GAP_MIN, Math.ceil(labelWidest) + 16)),
    lines,
    notes,
  }
}
