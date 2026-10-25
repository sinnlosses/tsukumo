// 折り返し配置の座標を、1行の数を1つ決めて組む。主経路を蛇行の行に並べ、上の段・行のあいだの通り道・図の左の外側に辺を回す。

import {
  EDGE_FONT_SIZE,
  EDGE_LINE_HEIGHT,
  emptyBox,
  FRAME_PAD,
  FRAME_TITLE,
  type FoldBox,
  type FoldMetrics,
  type FoldPath,
  type FoldSlot,
  type GraphFoldFigure,
} from "./graph-fold-figure.ts"
import { framesOf } from "./graph-fold-frame.ts"
import { wrapped } from "./graph-fold-text.ts"
import type { GraphSourceEdge, GraphSourceReading } from "./graph-source.ts"

const MARGIN = 12
/** 上の段の箱と主経路の箱のあいだ。辺のラベルが入る高さ。 */
const SIDE_GAP = 30
/** 行のあいだの帯の、最初の通り道までの高さ（折り返しの辺のラベルが入る）。 */
const BAND_TOP = 26
const TRACK_GAP = 20
const BAND_MIN = 32

type Attach = {
  readonly box: number
  readonly band: number
  readonly top: boolean
}

/** 1行に `perRow` 個ずつ並べた座標。上の段の節点が行の先頭（折り返して入る列）に付けば置けず `undefined`。 */
export function laidOut(
  reading: GraphSourceReading,
  main: readonly number[],
  anchors: ReadonlyMap<number, number>,
  metrics: FoldMetrics,
  perRow: number,
): GraphFoldFigure | undefined {
  const { nodes, edges, groups } = reading
  const rows = Math.ceil(main.length / perRow)
  const slots = new Map<number, FoldSlot>()
  for (const [position, at] of main.entries()) {
    const row = Math.floor(position / perRow)
    const step = position % perRow
    slots.set(at, { row, column: row % 2 === 0 ? step : perRow - 1 - step, side: false })
  }
  for (const [at, anchor] of anchors) {
    const slot = slots.get(anchor)
    if (slot === undefined || isWrapEntry(main, perRow, anchor)) {
      return undefined
    }
    slots.set(at, { ...slot, side: true })
  }
  const positionOf = new Map(main.map((at, position) => [at, position]))
  const consecutive = (edge: GraphSourceEdge): boolean =>
    !edge.returns && (positionOf.get(edge.to) ?? -2) - (positionOf.get(edge.from) ?? -9) === 1
  const anchored = (edge: GraphSourceEdge): boolean =>
    anchors.get(edge.from) === edge.to || anchors.get(edge.to) === edge.from
  const routed = edges.filter((edge) => !consecutive(edge) && !anchored(edge))

  const attaches = routed.map((edge) => attachOf(edge, slots, rows))
  if (attaches.some((pair) => pair === undefined)) {
    return undefined
  }
  const crossing = attaches.filter((pair) => pair !== undefined && pair[0].band !== pair[1].band)
  const tracks = Array.from({ length: rows + 1 }, () => 0)
  const trackOf = attaches.map((pair) => {
    if (pair === undefined) {
      return [0, 0] as const
    }
    const [from, to] = pair
    const first = tracks[from.band] ?? 0
    tracks[from.band] = first + 1
    if (from.band === to.band) {
      return [first, first] as const
    }
    const second = tracks[to.band] ?? 0
    tracks[to.band] = second + 1
    return [first, second] as const
  })

  const left = MARGIN + (crossing.length === 0 ? 0 : crossing.length * TRACK_GAP + 8)
  const { boxWidth, boxHeight, gap } = metrics
  const width = left + perRow * boxWidth + (perRow - 1) * gap + MARGIN
  const titled = groups.length > 0 ? FRAME_TITLE + FRAME_PAD : 0
  const bandHeight = tracks.map((count, band) =>
    band === 0 && count === 0 ? MARGIN : Math.max(BAND_MIN, BAND_TOP + count * TRACK_GAP),
  )
  const firstTrack = (band: number): number => (band === 0 ? BAND_TOP - TRACK_GAP / 2 : BAND_TOP)
  const sideRows = new Set([...anchors.keys()].map((at) => slots.get(at)?.row ?? -1))
  // 上の段と主経路の箱のあいだには、辺のラベルと主経路の箱の群の題が縦に並ぶ。
  const sideGap = SIDE_GAP + titled
  const bandTop: number[] = []
  const rowTop: number[] = []
  let y = 0
  for (let row = 0; row < rows; row += 1) {
    bandTop.push(y)
    y += (bandHeight[row] ?? BAND_MIN) + titled
    rowTop.push(y)
    y += (sideRows.has(row) ? boxHeight + sideGap : 0) + boxHeight
  }
  bandTop.push(y)
  const height = y + (bandHeight[rows] ?? MARGIN)

  const boxes = nodes.map((node, at): FoldBox => {
    const slot = slots.get(at) ?? { row: 0, column: 0, side: false }
    const top = rowTop[slot.row] ?? 0
    const sideOffset = sideRows.has(slot.row) && !slot.side ? boxHeight + sideGap : 0
    return {
      node: at,
      x: left + slot.column * (boxWidth + gap),
      y: top + sideOffset,
      width: boxWidth,
      height: boxHeight,
      shape: node.shape,
      tone: node.tone,
      change: node.change,
      lines: metrics.lines[at] ?? [node.name],
      notes: metrics.notes[at] ?? [],
    }
  })
  const boxOf = (at: number): FoldBox => boxes[at] ?? emptyBox
  const trackY = (band: number, index: number): number =>
    (bandTop[band] ?? 0) + firstTrack(band) + index * TRACK_GAP

  const used = new Map<string, number>()
  const attachX = (box: FoldBox, top: boolean): number => {
    const key = `${String(box.node)}:${top ? "t" : "b"}`
    const count = used.get(key) ?? 0
    used.set(key, count + 1)
    const fractions = [0.75, 0.25, 0.875, 0.125]
    return box.x + box.width * (fractions[count % fractions.length] ?? 0.5)
  }

  const straight = edges.flatMap((edge): FoldPath[] => {
    if (consecutive(edge)) {
      return [consecutivePath(edge, boxOf(edge.from), boxOf(edge.to), slots, gap)]
    }
    return []
  })
  const sidePairs = new Map<string, readonly GraphSourceEdge[]>()
  for (const edge of edges.filter((e) => !consecutive(e) && anchored(e))) {
    const key = [edge.from, edge.to].toSorted((a, b) => a - b).join(":")
    sidePairs.set(key, [...(sidePairs.get(key) ?? []), edge])
  }
  const sidePaths = [...sidePairs.values()].flatMap((pair) =>
    pair.map((edge, index) =>
      sidePath(edge, boxOf(edge.from), boxOf(edge.to), index, pair.length, titled),
    ),
  )
  let marginIndex = 0
  const routedPaths = routed.map((edge, index): FoldPath => {
    const pair = attaches[index]
    const [fromTrack, toTrack] = trackOf[index] ?? [0, 0]
    const [from, to] = pair ?? [
      { box: edge.from, band: 0, top: true },
      { box: edge.to, band: 0, top: true },
    ]
    const source = boxOf(from.box)
    const target = boxOf(to.box)
    const sx = attachX(source, from.top)
    const tx = attachX(target, to.top)
    const sy = from.top ? source.y : source.y + source.height
    const ty = to.top ? target.y : target.y + target.height
    const firstY = trackY(from.band, fromTrack)
    const label = wrapped(edge.label, EDGE_FONT_SIZE, gap * 2)
    if (from.band === to.band) {
      return {
        ...edgeLook(edge),
        points: [
          [sx, sy],
          [sx, firstY],
          [tx, firstY],
          [tx, ty],
        ],
        label,
        labelX: (sx + tx) / 2,
        labelY: firstY - 5,
        labelAnchor: "middle",
      }
    }
    const marginX = MARGIN + marginIndex * TRACK_GAP + 4
    marginIndex += 1
    const secondY = trackY(to.band, toTrack)
    return {
      ...edgeLook(edge),
      points: [
        [sx, sy],
        [sx, firstY],
        [marginX, firstY],
        [marginX, secondY],
        [tx, secondY],
        [tx, ty],
      ],
      label,
      labelX: (marginX + tx) / 2,
      labelY: secondY - 5,
      labelAnchor: "middle",
    }
  })

  return {
    width,
    height,
    boxes,
    paths: [...straight, ...sidePaths, ...routedPaths],
    frames: framesOf(reading, boxes, slots),
  }
}

/** 行の先頭の節点（上の行から折り返して入る列）。 */
function isWrapEntry(main: readonly number[], perRow: number, at: number): boolean {
  const position = main.indexOf(at)
  return position >= perRow && position % perRow === 0
}

/**
 * 回す辺の出入りの口。上の段の箱は上の帯からだけ、主経路の箱は下の帯（上の段が空いていれば上の帯も）から出入りする。
 * 出る帯と入る帯を同じにできればそうする。
 */
function attachOf(
  edge: GraphSourceEdge,
  slots: ReadonlyMap<number, FoldSlot>,
  rows: number,
): readonly [Attach, Attach] | undefined {
  const options = (at: number): readonly Attach[] => {
    const slot = slots.get(at)
    if (slot === undefined) {
      return []
    }
    if (slot.side) {
      return [{ box: at, band: slot.row, top: true }]
    }
    const coveredAbove = [...slots.entries()].some(
      ([other, s]) => other !== at && s.side && s.row === slot.row && s.column === slot.column,
    )
    const below = { box: at, band: Math.min(rows, slot.row + 1), top: false }
    return coveredAbove ? [below] : [below, { box: at, band: slot.row, top: true }]
  }
  const froms = options(edge.from)
  const tos = options(edge.to)
  for (const from of froms) {
    const to = tos.find((candidate) => candidate.band === from.band)
    if (to !== undefined) {
      return [from, to]
    }
  }
  const [from] = froms
  const [to] = tos
  return from === undefined || to === undefined ? undefined : [from, to]
}

function consecutivePath(
  edge: GraphSourceEdge,
  source: FoldBox,
  target: FoldBox,
  slots: ReadonlyMap<number, FoldSlot>,
  gap: number,
): FoldPath {
  const label = wrapped(edge.label, EDGE_FONT_SIZE, gap - 8)
  const sameRow = slots.get(edge.from)?.row === slots.get(edge.to)?.row
  if (sameRow) {
    const rightward = target.x > source.x
    const sx = rightward ? source.x + source.width : source.x
    const tx = rightward ? target.x : target.x + target.width
    const cy = source.y + source.height / 2
    return {
      ...edgeLook(edge),
      points: [
        [sx, cy],
        [tx, cy],
      ],
      label,
      labelX: (sx + tx) / 2,
      labelY: cy - 6 - (label.length - 1) * EDGE_LINE_HEIGHT,
      labelAnchor: "middle",
    }
  }
  const cx = source.x + source.width / 2
  const sy = source.y + source.height
  return {
    ...edgeLook(edge),
    points: [
      [cx, sy],
      [cx, target.y],
    ],
    label,
    labelX: cx + 6,
    labelY: sy + 16,
    labelAnchor: "start",
  }
}

/** 上の段の箱と、その下の主経路の箱を結ぶ縦の線。2本以上は横にずらす。 */
function sidePath(
  edge: GraphSourceEdge,
  source: FoldBox,
  target: FoldBox,
  index: number,
  count: number,
  titled: number,
): FoldPath {
  const spread = 24
  const offset = (index - (count - 1) / 2) * spread
  // 箱の右寄りを通す。左上には主経路の箱の群の題が来る。
  const x = source.x + source.width * 0.7 + offset
  const downward = target.y > source.y
  const sy = downward ? source.y + source.height : source.y
  const ty = downward ? target.y : target.y + target.height
  const label = wrapped(edge.label, EDGE_FONT_SIZE, source.width / 2 + 24)
  const leftSide = count > 1 && index < count / 2
  // ラベルは上の段の箱と、主経路の箱の群の題のあいだに置く。
  const upper = Math.min(sy, ty)
  const lower = Math.max(sy, ty) - titled
  return {
    ...edgeLook(edge),
    points: [
      [x, sy],
      [x, ty],
    ],
    label,
    labelX: leftSide ? x - 6 : x + 6,
    labelY: (upper + lower) / 2 + 4 - ((label.length - 1) * EDGE_LINE_HEIGHT) / 2,
    labelAnchor: leftSide ? "end" : "start",
  }
}

function edgeLook(edge: GraphSourceEdge): Pick<FoldPath, "returns" | "dashed" | "tone" | "change"> {
  return { returns: edge.returns, dashed: edge.dashed, tone: edge.tone, change: edge.change }
}
