// 最終レポートの段ごとの所要時間の横棒グラフの形と、HTML の組み立て。

import { formatElapsed, type MeasuredTime } from "../utils/elapsed-time.ts"
import { htmlInline } from "./report-markdown.ts"

/** 段1つの所要時間。`label` は段の見出しの字（「2/4 段の名前」）。 */
export type PhaseDuration = {
  readonly label: string
  readonly duration: MeasuredTime
}

/**
 * 横棒グラフの1行ぶん。段の行か、段のまとまりの行。
 * まとまりの行の `label` は「並列 2·3」、`wall` はまとまりの壁時計の所要、`phases` は中の段。
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
 * 段ごとの所要時間の横棒グラフ（1つの HTML の塊）。段が無ければ空文字。
 * 棒の長さは測れた段とまとまりの壁時計のうち一番長いものに対する比で、測れなかった段は棒を出さず「不明」と書く。
 * まとまりは見出しの行（壁時計）と中の段の行を1つの包みに入れ、中の段の行の字下げは CSS が持つ。
 */
export function phaseTimesMarkdown(rows: readonly PhaseTimeRow[]): string {
  if (rows.length === 0) {
    return ""
  }
  const longest = Math.max(
    0,
    ...rows
      .flatMap((row) =>
        row.kind === "phase" ? [row.duration] : [row.wall, ...row.phases.map((p) => p.duration)],
      )
      .map((duration) => (duration.kind === "known" ? duration.milliseconds : 0)),
  )
  const body = rows
    .map((row) =>
      row.kind === "phase"
        ? phaseTimeRowMarkdown(row, longest, "phase-time")
        : `<div class="phase-time-group" role="rowgroup">` +
          phaseTimeRowMarkdown(
            { label: row.label, duration: row.wall },
            longest,
            "phase-time phase-time-group-head",
          ) +
          row.phases.map((phase) => phaseTimeRowMarkdown(phase, longest, "phase-time")).join("") +
          `</div>`,
    )
    .join("")
  return (
    `<div class="phase-times">` +
    `<div class="phase-times-heading">段ごとの時間</div>` +
    `<div role="table" aria-label="段ごとの所要時間">${body}</div></div>`
  )
}

function phaseTimeRowMarkdown(
  { label, duration }: PhaseDuration,
  longest: number,
  className: string,
): string {
  const name = `<span class="phase-time-label">${htmlInline(label)}</span>`
  if (duration.kind === "unknown") {
    return (
      `<div class="${className}" role="row">${name}` +
      `<span class="phase-time-value phase-time-unknown">不明</span></div>`
    )
  }
  const width = longest > 0 ? Math.round((duration.milliseconds / longest) * 100) : 0
  const time = formatElapsed(Math.round(duration.milliseconds / 1000))
  return (
    `<div class="${className}" role="row">${name}` +
    `<span class="phase-time-track" aria-hidden="true">` +
    `<span class="phase-time-bar" style="width: ${String(width)}%"></span></span>` +
    `<span class="phase-time-value">${time}</span></div>`
  )
}
