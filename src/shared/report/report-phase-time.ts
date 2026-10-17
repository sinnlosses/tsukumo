// 最終レポートの段ごとの所要時間（1本の帯と一覧）の形と、HTML の組み立て。

import { formatElapsed, formatMeasured, type MeasuredTime } from "../utils/elapsed-time.ts"
import { htmlAttribute, htmlInline } from "./report-markdown.ts"

/** 段1つの所要時間。`label` は段の見出しの字（「2/4 段の名前」）、`start` は依頼の頭からの開始。 */
export type PhaseDuration = {
  readonly label: string
  readonly start: MeasuredTime
  readonly duration: MeasuredTime
}

/**
 * 帯と一覧の1行ぶん。段の行か、並列の段の行。
 * まとまりの行の `label` は「並列 2–3」、`start` と `wall` はまとまりの壁時計の開始と所要、`phases` は中の段。
 */
export type PhaseTimeRow =
  | ({ readonly kind: "phase" } & PhaseDuration)
  | {
      readonly kind: "parallel"
      readonly label: string
      readonly start: MeasuredTime
      readonly wall: MeasuredTime
      readonly phases: readonly PhaseDuration[]
    }

/**
 * 段ごとの所要時間（1つの HTML の塊）。段が無ければ空文字。
 * 見出しの行（計）・帯か横棒・一覧の順に出す。
 * 一本道で全部測れた回は、段ごとに1区間の1本の帯で、長さは時間の比。
 * 並列の段か測れなかった段がある回は、帯の代わりに1行1段の横棒（waterfall）を置く。
 * 棒の位置は依頼の頭からの開始、長さは所要で、まとまりの棒は中の段の棒の上に置き、測れなかった段は斜線の欠片で位置だけ示す。
 * 計は段（まとまりは壁時計の1区間）の測れた区間の和、割合はその区間の時間÷計の整数%、一番長い区間だけ強める。
 * 測れなかった区間は一覧で「不明」とし、割合は空欄にする。
 * まとまりの中の段は一覧にだけ字下げして並べ、割合は空欄にする。
 */
export function phaseTimesMarkdown(rows: readonly PhaseTimeRow[]): string {
  if (rows.length === 0) {
    return ""
  }
  const intervals = rows.map((row) => (row.kind === "phase" ? row.duration : row.wall))
  const knownMilliseconds = intervals.map((duration) =>
    duration.kind === "known" ? duration.milliseconds : 0,
  )
  const total = knownMilliseconds.reduce((sum, milliseconds) => sum + milliseconds, 0)
  const longest = Math.max(...knownMilliseconds)
  const longestIndex = longest > 0 ? knownMilliseconds.indexOf(longest) : -1

  const segments = rows.flatMap((row, index) =>
    row.kind === "phase" && row.duration.kind === "known"
      ? [bandSegmentMarkdown(row.label, row.duration, index === longestIndex)]
      : [],
  )
  const band =
    segments.length === rows.length
      ? `<div class="phase-band" aria-hidden="true">${segments.join("")}</div>`
      : waterfallMarkdown(rows, longestIndex)
  const list = rows
    .map((row, index) => {
      const duration = intervals[index] ?? { kind: "unknown" }
      const head = listRowMarkdown(
        { label: row.label, start: row.start, duration },
        { total, longest: index === longestIndex, inner: false },
      )
      return row.kind === "phase"
        ? head
        : `<div class="phase-time-group" role="rowgroup">${head}` +
            row.phases
              .map((phase) => listRowMarkdown(phase, { total, longest: false, inner: true }))
              .join("") +
            `</div>`
    })
    .join("")
  return (
    `<div class="phase-times">` +
    `<div class="phase-times-head"><span class="phase-times-heading">段ごとの時間</span>` +
    `<span class="phase-times-total">計 ${formatElapsed(Math.round(total / 1000))}</span></div>` +
    band +
    `<div role="table" aria-label="段ごとの所要時間">${list}</div></div>`
  )
}

type WaterfallBar = {
  readonly label: string
  readonly start: MeasuredTime
  readonly duration: MeasuredTime
  readonly longest: boolean
}

/** 開始か所要が測れなかった棒の幅（全体の%）。 */
const UNKNOWN_BAR_PERCENT = 2

/**
 * 行ごとの横棒。まとまりは壁時計の棒を中の段の棒の上に置く。
 * 開始か所要が測れなかった棒は斜線の欠片にして、直前までの棒の終わりに置く。
 */
function waterfallMarkdown(rows: readonly PhaseTimeRow[], longestIndex: number): string {
  const bars = rows.flatMap((row, index): readonly WaterfallBar[] =>
    row.kind === "phase"
      ? [{ ...row, longest: index === longestIndex }]
      : [
          {
            label: row.label,
            start: row.start,
            duration: row.wall,
            longest: index === longestIndex,
          },
          ...row.phases.map((phase) => ({ ...phase, longest: false })),
        ],
  )
  const ends = bars.map((bar) =>
    bar.start.kind === "known" && bar.duration.kind === "known"
      ? bar.start.milliseconds + bar.duration.milliseconds
      : undefined,
  )
  const extent = Math.max(0, ...ends.filter((end) => end !== undefined))
  const percent = (milliseconds: number): number =>
    extent > 0 ? Math.round((milliseconds / extent) * 10_000) / 100 : 0
  const lines = bars.map((bar, index) => {
    const title = `title="${htmlAttribute(bar.label)} ${formatMeasured(bar.duration)}"`
    if (bar.start.kind === "known" && bar.duration.kind === "known") {
      const className = bar.longest
        ? "phase-waterfall-bar phase-waterfall-longest"
        : "phase-waterfall-bar"
      return waterfallRowMarkdown(
        `<span class="${className}" ${title} style="margin-left: ${String(percent(bar.start.milliseconds))}%; width: ${String(percent(bar.duration.milliseconds))}%"></span>`,
      )
    }
    const before = Math.max(0, ...ends.slice(0, index).filter((end) => end !== undefined))
    const left = Math.min(percent(before), 100 - UNKNOWN_BAR_PERCENT)
    return waterfallRowMarkdown(
      `<span class="phase-waterfall-bar phase-waterfall-unknown" ${title} style="margin-left: ${String(left)}%; width: ${String(UNKNOWN_BAR_PERCENT)}%"></span>`,
    )
  })
  return `<div class="phase-waterfall" aria-hidden="true">${lines.join("")}</div>`
}

function waterfallRowMarkdown(bar: string): string {
  return `<div class="phase-waterfall-row">${bar}</div>`
}

function bandSegmentMarkdown(
  label: string,
  duration: Extract<MeasuredTime, { readonly kind: "known" }>,
  longest: boolean,
): string {
  const title = `title="${htmlAttribute(label)} ${formatMeasured(duration)}"`
  const className = longest ? "phase-band-segment phase-band-longest" : "phase-band-segment"
  return `<span class="${className}" ${title} style="flex: ${String(Math.round(duration.milliseconds))} 0 0"></span>`
}

type ListRowOptions = {
  readonly total: number
  readonly longest: boolean
  readonly inner: boolean
}

function listRowMarkdown(
  { label, duration }: PhaseDuration,
  { total, longest, inner }: ListRowOptions,
): string {
  const classes = ["phase-time"]
  if (inner) {
    classes.push("phase-time-inner")
  }
  if (longest) {
    classes.push("phase-time-longest")
  }
  if (duration.kind === "unknown") {
    classes.push("phase-time-unknown")
  }
  const mark = inner ? "" : `<span class="phase-time-mark"></span>`
  const ratio =
    inner || duration.kind === "unknown"
      ? ""
      : `${String(ratioPercent(duration.milliseconds, total))}%`
  return (
    `<div class="${classes.join(" ")}" role="row">${mark}${labelMarkdown(label)}` +
    `<span class="phase-time-value">${formatMeasured(duration)}</span>` +
    `<span class="phase-time-ratio">${ratio}</span></div>`
  )
}

function labelMarkdown(label: string): string {
  const match = /^(\d+\/\d+) (.+)$/.exec(label)
  const name =
    match === null
      ? htmlInline(label)
      : `<span class="phase-time-num">${htmlInline(match[1] ?? "")}</span>${htmlInline(match[2] ?? "")}`
  return `<span class="phase-time-label">${name}</span>`
}

function ratioPercent(milliseconds: number, total: number): number {
  return total > 0 ? Math.round((milliseconds / total) * 100) : 0
}
