// `timeline` の塊の本体（時刻の軸・行ごとの帯・延びた分・出来事・凡例）を、位置を % にした値に組む。

import { sumBy, unique } from "remeda"

import type { ReportTimeline } from "./timeline-block.ts"
import { readTimeline, type TimelineRowReading, timelineTicks } from "./timeline-scale.ts"

/** 時間の図の部品が付ける class の名前。描く側はこの名前に見た目を当てる。 */
export const TIMELINE_MARK_NAMES = [
  "timeline",
  "timeline-axis",
  "timeline-tick",
  "timeline-body",
  "timeline-lane",
  "timeline-row",
  "timeline-name",
  "timeline-track",
  "timeline-bar",
  "timeline-bar-emphasis",
  "timeline-extra",
  "timeline-uncertain",
  "timeline-uncertain-label",
  "timeline-arrow",
  "timeline-arrow-head",
  "timeline-point",
  "timeline-events",
  "timeline-event",
  "timeline-event-label",
  "timeline-legend",
  "timeline-legend-item",
  "timeline-legend-swatch",
  "timeline-legend-swatch-emphasis",
  "timeline-legend-swatch-plain",
  "timeline-legend-swatch-extra",
  "timeline-legend-swatch-uncertain",
  "timeline-legend-swatch-point",
  "timeline-legend-swatch-event",
] as const

/** 行の軌跡。位置と幅は軸に対する % の数。 */
export type TimelineTrackLayout =
  | {
      readonly kind: "point"
      readonly title: string
      readonly emphasized: boolean
      readonly marginLeft: number
    }
  | {
      readonly kind: "bar"
      readonly title: string
      readonly emphasized: boolean
      readonly marginLeft: number
      readonly width: number
      /** 延びた分の幅（%）の並び。 */
      readonly extras: readonly number[]
      readonly uncertain: TimelineUncertainLayout
    }

/** 延びた分の後ろに続く止まりうる区間。`width` は %。 */
export type TimelineUncertainLayout =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly width: number; readonly label: string }

/**
 * 待たれる行の終わりから、この行の開始へ入る矢印。`from`・`to` は軸の %。
 * 縦は待たれる行がこの行より何段上か（下なら負）を、間に挟まる行・レーンの見出し・区間の一言の数で言う。
 */
export type TimelineArrowLayout = {
  readonly from: number
  readonly to: number
  readonly rowSpan: number
  readonly laneSpan: number
  readonly labelSpan: number
}

export type TimelineRowLayout = {
  readonly name: string
  readonly track: TimelineTrackLayout
  readonly arrows: readonly TimelineArrowLayout[]
}

/** `lane` が空の群は見出しを持たない。 */
export type TimelineLaneLayout = {
  readonly lane: string
  readonly rows: readonly TimelineRowLayout[]
}

export type TimelineLegendSwatch = "emphasis" | "plain" | "extra" | "uncertain" | "point" | "event"

export type TimelineLayout = {
  /** 目盛りの字と、次の目盛りまでの幅（%）。最後の目盛りは 0。 */
  readonly axis: readonly { readonly label: string; readonly width: number }[]
  readonly lanes: readonly TimelineLaneLayout[]
  readonly events: readonly {
    readonly label: string
    readonly title: string
    readonly marginLeft: number
    /** ラベルを置く段（0 が最上段）。前の出来事のラベルと重なるものは次の段へ送る。 */
    readonly level: number
  }[]
  readonly legend: readonly { readonly swatch: TimelineLegendSwatch; readonly label: string }[]
}

/**
 * 塊の軸・行・出来事・凡例を、位置を % の数にした値にする。
 * 読めない・前後の逆な時刻の行は帯にせず飛ばす（入口が差し戻すので、ここでは投げない）。
 */
export function timelineLayoutOf(block: ReportTimeline): TimelineLayout {
  const reading = readTimeline(block)
  const drawn = block.rows.flatMap((row, index) => {
    const values = reading.rows[index]
    const shape = values === undefined ? undefined : rowShapeOf(row.end, values)
    return shape === undefined ? [] : [{ row, shape, index }]
  })
  const events = block.events.flatMap((event, index) => {
    const at = reading.events[index]
    return at === undefined ? [] : [{ event, at }]
  })
  const minutes = [
    ...drawn.flatMap(({ shape }) =>
      shape.kind === "point" ? [shape.start] : [shape.start, ...shape.ends, lastAtOf(shape)],
    ),
    ...events.map(({ at }) => at),
  ]
  const range = minutes.length === 0 ? [0] : minutes
  const { interval, ticks } = timelineTicks(Math.min(...range), Math.max(...range), reading.scale)
  const from = ticks[0]?.at ?? 0
  const width = (ticks.at(-1)?.at ?? from) - from
  const share = (minutesWide: number): number =>
    width > 0 ? Math.round((minutesWide / width) * 10_000) / 100 : 0
  const percent = (at: number): number => share(at - from)
  const emphasized = new Set(block.emphasis)

  const laneNames = unique(["", ...drawn.map(({ row }) => row.lane)])
  const ordered = laneNames.flatMap((lane) => drawn.filter(({ row }) => row.lane === lane))
  const arrowsOf = arrowLayoutOf(block, ordered, percent)
  const rowLayout = (item: DrawnRow, position: number): TimelineRowLayout => {
    const { row, shape } = item
    return {
      name: row.name,
      track:
        shape.kind === "point"
          ? {
              kind: "point",
              title: written(row.start),
              emphasized: emphasized.has(row.name),
              marginLeft: percent(shape.start),
            }
          : barLayout(row, shape, emphasized.has(row.name), percent),
      arrows: arrowsOf(position),
    }
  }
  const rowLayouts = ordered.map((item, position) => ({
    lane: item.row.lane,
    ...rowLayout(item, position),
  }))
  const lanes = laneNames.flatMap((lane): readonly TimelineLaneLayout[] => {
    const rows = rowLayouts.flatMap(({ lane: rowLane, ...layout }) =>
      rowLane === lane ? [layout] : [],
    )
    return rows.length === 0 ? [] : [{ lane, rows }]
  })
  return {
    axis: ticks.map((tick, index) => ({
      label: tick.label,
      width: index === ticks.length - 1 ? 0 : share(interval),
    })),
    lanes,
    events: eventsOf(
      events.map(({ event, at }) => ({
        label: event.label,
        title: `${written(event.at)} ${event.label}`,
        marginLeft: percent(at),
      })),
    ),
    legend: legendOf(block, drawn, events.length > 0),
  }
}

/** 軸の幅を 700px 前後、字の大きさを 14px 前後と見て、全角 1 字が占める軸の % の見積もり。 */
const LABEL_PERCENT_PER_FULL_WIDTH_CHAR = 2
/** 半角 1 字が全角 1 字に対して占める割合の見積もり。 */
const HALF_WIDTH_RATIO = 0.55
/** ラベルの右端と次のラベルの左端のあいだに空ける % 。 */
const LABEL_GAP_PERCENT = 1
/** 先頭から順に空きを探す段の数。全部埋まったら、重ねずに下へ段を足す。 */
const TIMELINE_EVENT_REUSED_LEVELS = 4

function labelWidthPercent(label: string): number {
  const em = sumBy([...label], (char) => (char.charCodeAt(0) < 0x100 ? HALF_WIDTH_RATIO : 1))
  return em * LABEL_PERCENT_PER_FULL_WIDTH_CHAR
}

function eventsOf(
  events: readonly {
    readonly label: string
    readonly title: string
    readonly marginLeft: number
  }[],
): TimelineLayout["events"] {
  const order = events
    .map((_, index) => index)
    .toSorted((a, b) => (events[a]?.marginLeft ?? 0) - (events[b]?.marginLeft ?? 0))
  const rightEdges: number[] = []
  const levels = new Map<number, number>()
  for (const index of order) {
    const event = events[index]
    if (event === undefined) continue
    const free = rightEdges.findIndex(
      (edge, level) =>
        level < TIMELINE_EVENT_REUSED_LEVELS && edge + LABEL_GAP_PERCENT <= event.marginLeft,
    )
    const level = free === -1 ? rightEdges.length : free
    rightEdges[level] = event.marginLeft + labelWidthPercent(event.label)
    levels.set(index, level)
  }
  return events.map((event, index) => ({ ...event, level: levels.get(index) ?? 0 }))
}

type RowShape =
  | { readonly kind: "point"; readonly start: number }
  | {
      readonly kind: "bar"
      readonly start: number
      /** 帯の終わりと、延びた分の区切りの並び。延びた分が読めなければ帯の終わりだけ。 */
      readonly ends: readonly [number, ...number[]]
      /** 止まりうる区間の終わり。読めない・延びた分の最後より後でなければ `none`。 */
      readonly uncertain:
        | { readonly kind: "none" }
        | { readonly kind: "until"; readonly at: number }
    }

type Row = ReportTimeline["rows"][number]

type DrawnRow = { readonly row: Row; readonly shape: RowShape; readonly index: number }

function rowShapeOf(writtenEnd: string | number, values: TimelineRowReading): RowShape | undefined {
  const { start, end, extra, uncertain } = values
  if (start === undefined) return undefined
  if (written(writtenEnd) === "") return { kind: "point", start }
  if (end === undefined || end < start) return undefined
  const extraEnds = extra.filter((value) => value !== undefined)
  const ascending =
    extraEnds.length === extra.length &&
    extraEnds.every((value, index) => value > (index === 0 ? end : (extraEnds[index - 1] ?? end)))
  const ends: readonly [number, ...number[]] = ascending ? [end, ...extraEnds] : [end]
  const lastEnd = ends.at(-1) ?? end
  return {
    kind: "bar",
    start,
    ends,
    uncertain:
      uncertain !== undefined && uncertain > lastEnd
        ? { kind: "until", at: uncertain }
        : { kind: "none" },
  }
}

/** 行の図形の右端（止まりうる区間があればその終わり）。 */
function lastAtOf(shape: RowShape): number {
  if (shape.kind === "point") return shape.start
  return shape.uncertain.kind === "until" ? shape.uncertain.at : (shape.ends.at(-1) ?? shape.start)
}

function barLayout(
  row: Row,
  shape: Extract<RowShape, { readonly kind: "bar" }>,
  emphasized: boolean,
  percent: (at: number) => number,
): TimelineTrackLayout {
  const [end, ...extraEnds] = shape.ends
  const lastEnd = extraEnds.at(-1) ?? end
  const extraText =
    extraEnds.length === 0 ? "" : `（延び ${row.extra.map((value) => written(value)).join("・")}）`
  const uncertainText =
    shape.uncertain.kind === "none" ? "" : `（止まりうる 〜${written(row.uncertain.until)}）`
  return {
    kind: "bar",
    title: `${written(row.start)}–${written(row.end)}${extraText}${uncertainText}`,
    emphasized,
    marginLeft: percent(shape.start),
    width: percent(end) - percent(shape.start),
    extras: extraEnds.map((at, index) => {
      const previous = index === 0 ? end : (extraEnds[index - 1] ?? end)
      return percent(at) - percent(previous)
    }),
    uncertain:
      shape.uncertain.kind === "none"
        ? { kind: "none" }
        : {
            kind: "shown",
            width: percent(shape.uncertain.at) - percent(lastEnd),
            label: uncertainLabelOf(row, shape),
          },
  }
}

/** 棒の下に置く一言。止まりうる区間を描かない行は空。 */
function uncertainLabelOf(row: Row, shape: RowShape): string {
  return shape.kind === "bar" && shape.uncertain.kind === "until" ? row.uncertain.label.trim() : ""
}

/** 描く順の位置ごとに、その行へ入る矢印を返す関数。名前が1つの行に決まらない `after` と描かない行は飛ばす。 */
function arrowLayoutOf(
  block: ReportTimeline,
  ordered: readonly DrawnRow[],
  percent: (at: number) => number,
): (position: number) => readonly TimelineArrowLayout[] {
  const positionOfIndex = new Map(ordered.map(({ index }, position) => [index, position]))
  const labeled = ordered.map(({ row, shape }) => uncertainLabelOf(row, shape) !== "")
  const opensLane = ordered.map(
    ({ row }, position) => row.lane !== "" && ordered[position - 1]?.row.lane !== row.lane,
  )
  return (position) => {
    const target = ordered[position]
    if (target === undefined) return []
    return unique(target.row.after).flatMap((name): readonly TimelineArrowLayout[] => {
      const found = block.rows.flatMap((row, index) => (row.name === name ? [index] : []))
      const [sourceIndex] = found
      const source = found.length === 1 ? positionOfIndex.get(sourceIndex ?? -1) : undefined
      const sourceRow = source === undefined ? undefined : ordered[source]
      if (source === undefined || sourceRow === undefined || source === position) return []
      const [low, high] = source < position ? [source, position] : [position, source]
      // 0 - 0 は +0。-count と書くと -0 が style の字に出る
      const signed = (count: number): number => (source < position ? count : 0 - count)
      return [
        {
          from: percent(lastAtOf(sourceRow.shape)),
          to: percent(target.shape.start),
          rowSpan: signed(high - low),
          laneSpan: signed(countIn(opensLane, low + 1, high + 1)),
          labelSpan: signed(countIn(labeled, low, high)),
        },
      ]
    })
  }
}

function countIn(flags: readonly boolean[], from: number, to: number): number {
  return flags.slice(from, to).filter(Boolean).length
}

function legendOf(
  block: ReportTimeline,
  drawn: readonly DrawnRow[],
  hasEvents: boolean,
): TimelineLayout["legend"] {
  const emphasized = drawn.some(({ row }) => block.emphasis.includes(row.name))
  const items: readonly {
    readonly swatch: TimelineLegendSwatch
    readonly label: string
    readonly shown: boolean
  }[] = [
    { swatch: "emphasis", label: "注目", shown: emphasized },
    { swatch: "plain", label: "ほか", shown: emphasized },
    {
      swatch: "extra",
      label: "延びた分",
      shown: drawn.some(({ shape }) => shape.kind === "bar" && shape.ends.length > 1),
    },
    {
      swatch: "uncertain",
      label: "止まりうる分",
      shown: drawn.some(({ shape }) => shape.kind === "bar" && shape.uncertain.kind === "until"),
    },
    { swatch: "point", label: "一点", shown: drawn.some(({ shape }) => shape.kind === "point") },
    { swatch: "event", label: "出来事", shown: hasEvents },
  ]
  return items.flatMap(({ swatch, label, shown }) => (shown ? [{ swatch, label }] : []))
}

function written(value: string | number): string {
  return String(value).trim()
}
