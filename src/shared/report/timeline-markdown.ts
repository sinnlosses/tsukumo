// `timeline` の塊の本体（時刻の軸・行ごとの帯・延びた分・出来事・凡例）を、値と HTML の1行に組む。

import { htmlAttribute, htmlInline } from "./report-inline-markdown.ts"
import type { ReportTimeline } from "./timeline-block.ts"
import { readTimeline, type TimelineRowReading, timelineTicks } from "./timeline-scale.ts"

/** `timelineHtml` が付ける class の名前。描く側はこの名前に見た目を当てる。 */
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
    }

export type TimelineRowLayout = {
  readonly name: string
  readonly track: TimelineTrackLayout
}

/** `lane` が空の群は見出しを持たない。 */
export type TimelineLaneLayout = {
  readonly lane: string
  readonly rows: readonly TimelineRowLayout[]
}

export type TimelineLegendSwatch = "emphasis" | "plain" | "extra" | "point" | "event"

export type TimelineLayout = {
  /** 目盛りの字と、次の目盛りまでの幅（%）。最後の目盛りは 0。 */
  readonly axis: readonly { readonly label: string; readonly width: number }[]
  readonly lanes: readonly TimelineLaneLayout[]
  readonly events: readonly {
    readonly label: string
    readonly title: string
    readonly marginLeft: number
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
    return shape === undefined ? [] : [{ row, shape }]
  })
  const events = block.events.flatMap((event, index) => {
    const at = reading.events[index]
    return at === undefined ? [] : [{ event, at }]
  })
  const minutes = [
    ...drawn.flatMap(({ shape }) =>
      shape.kind === "point" ? [shape.start] : [shape.start, ...shape.ends],
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

  const rowLayout = ({ row, shape }: (typeof drawn)[number]): TimelineRowLayout => ({
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
  })
  const lanes = [...new Set(["", ...drawn.map(({ row }) => row.lane)])].flatMap(
    (lane): readonly TimelineLaneLayout[] => {
      const rows = drawn.filter(({ row }) => row.lane === lane)
      return rows.length === 0 ? [] : [{ lane, rows: rows.map(rowLayout) }]
    },
  )
  return {
    axis: ticks.map((tick, index) => ({
      label: tick.label,
      width: index === ticks.length - 1 ? 0 : share(interval),
    })),
    lanes,
    events: events.map(({ event, at }) => ({
      label: event.label,
      title: `${written(event.at)} ${event.label}`,
      marginLeft: percent(at),
    })),
    legend: legendOf(block, drawn, events.length > 0),
  }
}

/**
 * 塊の HTML（空行を挟まない1行。挟むと Markdown の HTML の塊が切れる）。位置は `margin-left`・`width` の % だけで書く。
 */
export function timelineHtml(block: ReportTimeline): string {
  const layout = timelineLayoutOf(block)
  const axis = layout.axis
    .map(
      (tick) =>
        `<span class="timeline-tick" style="width: ${String(tick.width)}%">${htmlInline(tick.label)}</span>`,
    )
    .join("")
  const body = layout.lanes
    .map(({ lane, rows }) => {
      const heading = lane === "" ? "" : `<div class="timeline-lane">${htmlInline(lane)}</div>`
      return heading + rows.map(rowHtml).join("")
    })
    .join("")
  const eventHtml =
    layout.events.length === 0
      ? ""
      : `<div class="timeline-events">${layout.events
          .map(
            (event) =>
              `<span class="timeline-event" title="${htmlAttribute(event.title)}" style="margin-left: ${String(event.marginLeft)}%"><span class="timeline-event-label">${htmlInline(event.label)}</span></span>`,
          )
          .join("")}</div>`

  return (
    `<div class="timeline"><div class="timeline-axis">${axis}</div>` +
    `<div class="timeline-body">${body}${eventHtml}</div></div>` +
    legendHtml(layout.legend)
  )
}

type RowShape =
  | { readonly kind: "point"; readonly start: number }
  | {
      readonly kind: "bar"
      readonly start: number
      /** 帯の終わりと、延びた分の区切りの並び。延びた分が読めなければ帯の終わりだけ。 */
      readonly ends: readonly [number, ...number[]]
    }

type Row = ReportTimeline["rows"][number]

function rowShapeOf(writtenEnd: string | number, values: TimelineRowReading): RowShape | undefined {
  const { start, end, extra } = values
  if (start === undefined) return undefined
  if (written(writtenEnd) === "") return { kind: "point", start }
  if (end === undefined || end < start) return undefined
  const extraEnds = extra.filter((value) => value !== undefined)
  const ascending =
    extraEnds.length === extra.length &&
    extraEnds.every((value, index) => value > (index === 0 ? end : (extraEnds[index - 1] ?? end)))
  return { kind: "bar", start, ends: ascending ? [end, ...extraEnds] : [end] }
}

function barLayout(
  row: Row,
  shape: Extract<RowShape, { readonly kind: "bar" }>,
  emphasized: boolean,
  percent: (at: number) => number,
): TimelineTrackLayout {
  const [end, ...extraEnds] = shape.ends
  const extraText =
    extraEnds.length === 0 ? "" : `（延び ${row.extra.map((value) => written(value)).join("・")}）`
  return {
    kind: "bar",
    title: `${written(row.start)}–${written(row.end)}${extraText}`,
    emphasized,
    marginLeft: percent(shape.start),
    width: percent(end) - percent(shape.start),
    extras: extraEnds.map((at, index) => {
      const previous = index === 0 ? end : (extraEnds[index - 1] ?? end)
      return percent(at) - percent(previous)
    }),
  }
}

function rowHtml({ name, track }: TimelineRowLayout): string {
  return `<div class="timeline-row"><span class="timeline-name" title="${htmlAttribute(name)}">${htmlInline(name)}</span><span class="timeline-track">${trackHtml(track)}</span></div>`
}

function trackHtml(track: TimelineTrackLayout): string {
  const tone = track.emphasized ? " timeline-bar-emphasis" : ""
  if (track.kind === "point") {
    return `<span class="timeline-point${tone}" title="${htmlAttribute(track.title)}" style="margin-left: ${String(track.marginLeft)}%"></span>`
  }
  const bar = `<span class="timeline-bar${tone}" title="${htmlAttribute(track.title)}" style="margin-left: ${String(track.marginLeft)}%; width: ${String(track.width)}%"></span>`
  const extras = track.extras.map(
    (width) => `<span class="timeline-extra" style="width: ${String(width)}%"></span>`,
  )
  return bar + extras.join("")
}

function legendOf(
  block: ReportTimeline,
  drawn: readonly { readonly row: Row; readonly shape: RowShape }[],
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
    { swatch: "point", label: "一点", shown: drawn.some(({ shape }) => shape.kind === "point") },
    { swatch: "event", label: "出来事", shown: hasEvents },
  ]
  return items.flatMap(({ swatch, label, shown }) => (shown ? [{ swatch, label }] : []))
}

function legendHtml(legend: TimelineLayout["legend"]): string {
  return legend.length === 0
    ? ""
    : `<div class="timeline-legend">${legend
        .map(
          ({ swatch, label }) =>
            `<span class="timeline-legend-item"><span class="timeline-legend-swatch timeline-legend-swatch-${swatch}" aria-hidden="true"></span>${label}</span>`,
        )
        .join("")}</div>`
}

function written(value: string | number): string {
  return String(value).trim()
}
