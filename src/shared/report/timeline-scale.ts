// `timeline` の塊の時刻の読み（尺度の判別・分の値・誤り）と、軸の目盛り。

import type { ReportTimeline } from "./timeline-block.ts"

export type TimelineScale = "clock" | "iso" | "minutes"

/** `row`・`event` は1始まり。 */
export type TimelinePlace =
  | { readonly kind: "row"; readonly row: number }
  | { readonly kind: "event"; readonly event: number }
  | { readonly kind: "emphasis" }

export type TimelineFaultReason =
  | "unreadable"
  | "mixed-scale"
  | "not-ascending"
  | "end-before-start"
  | "unknown-emphasis"

export type TimelineFault = { readonly place: TimelinePlace; readonly reason: TimelineFaultReason }

/** 値は軸の上の分。読めない・尺度の割れた値は `undefined`。`end` は一点の行でも `undefined`。 */
export type TimelineRowReading = {
  readonly start: number | undefined
  readonly end: number | undefined
  readonly extra: readonly (number | undefined)[]
}

export type TimelineReading = {
  /** 読めた値が1つも無ければ `minutes`。 */
  readonly scale: TimelineScale
  readonly rows: readonly TimelineRowReading[]
  readonly events: readonly (number | undefined)[]
  /** 行 → 出来事 → `emphasis` の順。同じ場所・同じ理由は1つにまとめる。 */
  readonly faults: readonly TimelineFault[]
}

export type TimelineTick = { readonly at: number; readonly label: string }

/** 目盛りの数（区間の数）の上限。 */
const MAX_TICK_SPANS = 8

const MINUTES_PER_DAY = 1440

/** 1日より先は1日の 2・5・10・20・50… 倍。100万日で打ち切る（分の値はそこまで広がらない）。 */
const INTERVAL_CANDIDATES: readonly number[] = [
  1,
  2,
  5,
  10,
  30,
  60,
  360,
  MINUTES_PER_DAY,
  ...Array.from({ length: 6 }, (_, power) =>
    [2, 5, 10].map((multiplier) => MINUTES_PER_DAY * multiplier * 10 ** power),
  ).flat(),
]

const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/

const ISO_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?))?(Z|[+-]\d{2}:\d{2})?$/

const MINUTES_PATTERN = /^-?\d+(?:\.\d+)?$/

/** 塊の時刻を読み、尺度・分の値・誤りを返す。 */
export function readTimeline(block: ReportTimeline): TimelineReading {
  const scaleKind = [
    ...block.rows.flatMap((row) => [row.start, row.end, ...row.extra]),
    ...block.events.map((event) => event.at),
  ]
    .flatMap((value) => {
      const read = readValue(value)
      return typeof read === "object" ? [read.kind] : []
    })
    .at(0)
  const scale = scaleKind === undefined ? "minutes" : scaleOfKind(scaleKind)
  const valueAt = (value: string | number): PlacedValue => {
    const read = readValue(value)
    if (read === "omitted") return { minutes: undefined, fault: undefined }
    if (read === undefined) return { minutes: undefined, fault: "unreadable" }
    if (read.kind !== scaleKind) return { minutes: undefined, fault: "mixed-scale" }
    return { minutes: read.minutes, fault: undefined }
  }

  const rowValues = block.rows.map((row) => ({
    start: valueAt(row.start),
    end: valueAt(row.end),
    extra: row.extra.map(valueAt),
  }))
  const rows = rowValues.map((values): TimelineRowReading => ({
    start: values.start.minutes,
    end: values.end.minutes,
    extra: values.extra.map((value) => value.minutes),
  }))
  const rowFaults = block.rows.flatMap((row, index): readonly TimelineFault[] => {
    const values = rowValues[index]
    const reading = rows[index]
    if (values === undefined || reading === undefined) return []
    const previousStart = block.rows
      .slice(0, index)
      .flatMap((other, at) => (other.lane === row.lane ? [rows[at]?.start] : []))
      .findLast((start) => start !== undefined)
    const reasons: readonly (TimelineFaultReason | undefined)[] = [
      ...[values.start, values.end, ...values.extra].map((value) => value.fault),
      reading.start !== undefined && previousStart !== undefined && reading.start < previousStart
        ? "not-ascending"
        : undefined,
      reading.start !== undefined && reading.end !== undefined && reading.end < reading.start
        ? "end-before-start"
        : undefined,
      extraAscends(row.end, reading) ? undefined : "not-ascending",
    ]
    return uniqueReasons(reasons).map((reason) => ({
      place: { kind: "row", row: index + 1 },
      reason,
    }))
  })

  const eventValues = block.events.map((event) => valueAt(event.at))
  const events = eventValues.map((value) => value.minutes)
  const eventFaults = eventValues.flatMap((value, index): readonly TimelineFault[] => {
    const at = value.minutes
    const previous = events.slice(0, index).findLast((other) => other !== undefined)
    const reasons = uniqueReasons([
      value.fault,
      at !== undefined && previous !== undefined && at < previous ? "not-ascending" : undefined,
    ])
    return reasons.map((reason) => ({ place: { kind: "event", event: index + 1 }, reason }))
  })

  const names = new Set(block.rows.map((row) => row.name))
  const emphasisFaults: readonly TimelineFault[] = block.emphasis.some((name) => !names.has(name))
    ? [{ place: { kind: "emphasis" }, reason: "unknown-emphasis" }]
    : []

  return { scale, rows, events, faults: [...rowFaults, ...eventFaults, ...emphasisFaults] }
}

/**
 * 最小〜最大の範囲の目盛り。間隔は区間の数が {@link MAX_TICK_SPANS} 以下になる最小の候補で、
 * 軸の端は最小を切り下げ・最大を切り上げた間隔の倍数。範囲が0なら区間は1つ。
 */
export function timelineTicks(
  min: number,
  max: number,
  scale: TimelineScale,
): { readonly interval: number; readonly ticks: readonly TimelineTick[] } {
  const interval =
    INTERVAL_CANDIDATES.find((candidate) => spanCount(min, max, candidate) <= MAX_TICK_SPANS) ??
    INTERVAL_CANDIDATES.at(-1) ??
    MINUTES_PER_DAY
  const from = Math.floor(min / interval) * interval
  const ats = Array.from(
    { length: spanCount(min, max, interval) + 1 },
    (_, index) => from + index * interval,
  )
  return {
    interval,
    ticks: ats.map((at, index) => ({ at, label: tickLabel(at, ats[index - 1], interval, scale) })),
  }
}

type ValueKind = "clock" | "minutes" | `iso${string}`

type ReadValue = { readonly kind: ValueKind; readonly minutes: number }

type PlacedValue = {
  readonly minutes: number | undefined
  readonly fault: "unreadable" | "mixed-scale" | undefined
}

function readValue(value: string | number): ReadValue | "omitted" | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? { kind: "minutes", minutes: value } : undefined
  }
  const text = value.trim()
  if (text === "") return "omitted"
  if (MINUTES_PATTERN.test(text)) return { kind: "minutes", minutes: Number(text) }
  const clock = CLOCK_PATTERN.exec(text)
  if (clock !== null) {
    const hour = Number(clock[1])
    const minute = Number(clock[2])
    return hour <= 23 && minute <= 59 ? { kind: "clock", minutes: hour * 60 + minute } : undefined
  }
  const iso = ISO_PATTERN.exec(text)
  if (iso === null) return undefined
  const [, date = "", time, zone = ""] = iso
  // 時差は時刻があるときだけ書ける。値は書かれた壁時計のまま読み、時差は尺度の目印にだけ使う
  if (time === undefined && zone !== "") return undefined
  try {
    const dateTime = Temporal.PlainDateTime.from(`${date}T${time ?? "00:00"}`, {
      overflow: "reject",
    })
    return {
      kind: `iso${zone}`,
      minutes: dateTime.toZonedDateTime("UTC").epochMilliseconds / 60_000,
    }
  } catch {
    return undefined
  }
}

function scaleOfKind(kind: ValueKind): TimelineScale {
  return kind === "clock" || kind === "minutes" ? kind : "iso"
}

/** 一点の行（`end` を省いた行）に `extra` は書けない。`extra` は `end` より後で昇順。 */
function extraAscends(writtenEnd: string | number, reading: TimelineRowReading): boolean {
  if (reading.extra.length === 0) return true
  if (readValue(writtenEnd) === "omitted") return false
  const chain = [reading.end, ...reading.extra].filter((value) => value !== undefined)
  return chain.every((value, index) => index === 0 || value > (chain[index - 1] ?? value))
}

function uniqueReasons(
  reasons: readonly (TimelineFaultReason | undefined)[],
): readonly TimelineFaultReason[] {
  return [...new Set(reasons.filter((reason) => reason !== undefined))]
}

function spanCount(min: number, max: number, interval: number): number {
  const from = Math.floor(min / interval) * interval
  const to = Math.ceil(max / interval) * interval
  return Math.max(1, Math.round((to - from) / interval))
}

function tickLabel(
  at: number,
  previous: number | undefined,
  interval: number,
  scale: TimelineScale,
): string {
  switch (scale) {
    case "minutes":
      return interval >= 60 ? `${String(at / 60)}時間` : `${String(at)}分`
    case "clock":
      return hourMinute(Math.floor(at / 60), at % 60)
    case "iso": {
      const date = Temporal.Instant.fromEpochMilliseconds(at * 60_000).toZonedDateTimeISO("UTC")
      const day = `${String(date.month)}/${String(date.day)}`
      if (interval >= MINUTES_PER_DAY) return day
      const time = hourMinute(date.hour, date.minute)
      const previousDay =
        previous === undefined
          ? undefined
          : Temporal.Instant.fromEpochMilliseconds(previous * 60_000)
              .toZonedDateTimeISO("UTC")
              .toPlainDate()
      return previousDay !== undefined && previousDay.equals(date.toPlainDate())
        ? time
        : `${day} ${time}`
    }
  }
}

function hourMinute(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(Math.round(minute)).padStart(2, "0")}`
}
