// `timeline` の塊の本体（時刻の軸・行ごとの帯・延びた分・出来事・凡例）を HTML の1行に組む。

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

/**
 * 塊の HTML（空行を挟まない1行。挟むと Markdown の HTML の塊が切れる）。位置は `margin-left`・`width` の % だけで書く。
 * 読めない・前後の逆な時刻の行は帯を組まずに飛ばす（入口が差し戻すので、ここでは投げない）。
 */
export function timelineHtml(block: ReportTimeline): string {
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

  const axis = ticks
    .map(
      (tick, index) =>
        `<span class="timeline-tick" style="width: ${String(index === ticks.length - 1 ? 0 : share(interval))}%">${htmlInline(tick.label)}</span>`,
    )
    .join("")

  const rowHtml = ({ row, shape }: (typeof drawn)[number]): string => {
    const tone = emphasized.has(row.name) ? " timeline-bar-emphasis" : ""
    const track =
      shape.kind === "point"
        ? `<span class="timeline-point${tone}" title="${htmlAttribute(written(row.start))}" style="margin-left: ${String(percent(shape.start))}%"></span>`
        : barHtml(row, shape, tone, percent)
    return `<div class="timeline-row"><span class="timeline-name" title="${htmlAttribute(row.name)}">${htmlInline(row.name)}</span><span class="timeline-track">${track}</span></div>`
  }
  const lanes = [...new Set(["", ...drawn.map(({ row }) => row.lane)])]
  const body = lanes
    .map((lane) => {
      const rows = drawn.filter(({ row }) => row.lane === lane)
      if (rows.length === 0) return ""
      const heading = lane === "" ? "" : `<div class="timeline-lane">${htmlInline(lane)}</div>`
      return heading + rows.map(rowHtml).join("")
    })
    .join("")
  const eventHtml =
    events.length === 0
      ? ""
      : `<div class="timeline-events">${events
          .map(
            ({ event, at }) =>
              `<span class="timeline-event" title="${htmlAttribute(`${written(event.at)} ${event.label}`)}" style="margin-left: ${String(percent(at))}%"><span class="timeline-event-label">${htmlInline(event.label)}</span></span>`,
          )
          .join("")}</div>`

  return (
    `<div class="timeline"><div class="timeline-axis">${axis}</div>` +
    `<div class="timeline-body">${body}${eventHtml}</div></div>` +
    legendHtml(block, drawn, events.length > 0)
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

function barHtml(
  row: Row,
  shape: Extract<RowShape, { readonly kind: "bar" }>,
  tone: string,
  percent: (at: number) => number,
): string {
  const [end, ...extraEnds] = shape.ends
  const extraText =
    extraEnds.length === 0 ? "" : `（延び ${row.extra.map((value) => written(value)).join("・")}）`
  const title = `${written(row.start)}–${written(row.end)}${extraText}`
  const bar = `<span class="timeline-bar${tone}" title="${htmlAttribute(title)}" style="margin-left: ${String(percent(shape.start))}%; width: ${String(percent(end) - percent(shape.start))}%"></span>`
  const extras = extraEnds.map((at, index) => {
    const previous = index === 0 ? end : (extraEnds[index - 1] ?? end)
    return `<span class="timeline-extra" style="width: ${String(percent(at) - percent(previous))}%"></span>`
  })
  return bar + extras.join("")
}

function legendHtml(
  block: ReportTimeline,
  drawn: readonly { readonly row: Row; readonly shape: RowShape }[],
  hasEvents: boolean,
): string {
  const emphasized = drawn.some(({ row }) => block.emphasis.includes(row.name))
  const items = [
    { swatch: "emphasis", label: "注目", shown: emphasized },
    { swatch: "plain", label: "ほか", shown: emphasized },
    {
      swatch: "extra",
      label: "延びた分",
      shown: drawn.some(({ shape }) => shape.kind === "bar" && shape.ends.length > 1),
    },
    { swatch: "point", label: "一点", shown: drawn.some(({ shape }) => shape.kind === "point") },
    { swatch: "event", label: "出来事", shown: hasEvents },
  ].filter((item) => item.shown)
  return items.length === 0
    ? ""
    : `<div class="timeline-legend">${items
        .map(
          ({ swatch, label }) =>
            `<span class="timeline-legend-item"><span class="timeline-legend-swatch timeline-legend-swatch-${swatch}" aria-hidden="true"></span>${label}</span>`,
        )
        .join("")}</div>`
}

function written(value: string | number): string {
  return String(value).trim()
}
