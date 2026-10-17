// 最終レポートの段ごとの所要時間（1本の帯と一覧）の形と、HTML の組み立て。

import { formatElapsed, formatMeasured, type MeasuredTime } from "../utils/elapsed-time.ts"
import { htmlAttribute, htmlInline } from "./report-markdown.ts"

/** 段1つの所要時間。`label` は段の見出しの字（「2/4 段の名前」）。 */
export type PhaseDuration = {
  readonly label: string
  readonly duration: MeasuredTime
}

/**
 * 帯と一覧の1行ぶん。段の行か、並列の段の行。
 * まとまりの行の `label` は「並列 2–3」、`wall` はまとまりの壁時計の所要、`phases` は中の段。
 */
export type PhaseTimeRow =
  | ({ readonly kind: "phase" } & PhaseDuration)
  | {
      readonly kind: "parallel"
      readonly label: string
      readonly wall: MeasuredTime
      readonly phases: readonly PhaseDuration[]
    }

/**
 * 段ごとの所要時間（1つの HTML の塊）。段が無ければ空文字。
 * 見出しの行（計）・帯・一覧の順に出す。帯は段（まとまりは壁時計の1区間）ごとに1区間で、長さは時間の比。
 * 計は帯に出した測れた区間の和、割合はその区間の時間÷計の整数%、一番長い区間だけ強める。
 * 測れなかった区間は帯に斜線の欠片で位置だけ示し、一覧は「不明」で割合は空欄にする。
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

  const band = rows
    .map((row, index) =>
      bandSegmentMarkdown(
        row.label,
        intervals[index] ?? { kind: "unknown" },
        index === longestIndex,
      ),
    )
    .join("")
  const list = rows
    .map((row, index) => {
      const duration = intervals[index] ?? { kind: "unknown" }
      const head = listRowMarkdown(
        { label: row.label, duration },
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
    `<div class="phase-band" aria-hidden="true">${band}</div>` +
    `<div role="table" aria-label="段ごとの所要時間">${list}</div></div>`
  )
}

function bandSegmentMarkdown(label: string, duration: MeasuredTime, longest: boolean): string {
  const title = `title="${htmlAttribute(label)} ${formatMeasured(duration)}"`
  if (duration.kind === "unknown") {
    return `<span class="phase-band-segment phase-band-unknown" ${title}></span>`
  }
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
