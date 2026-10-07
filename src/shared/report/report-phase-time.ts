// 最終レポートの段ごとの所要時間の横棒グラフの形と、HTML の組み立て。

import { formatElapsed, type MeasuredTime } from "../utils/elapsed-time.ts"
import { htmlInline } from "./report-markdown.ts"

/** 段1つの所要時間。`label` は段の見出しの字（「2/4 段の名前」）。 */
export type PhaseDuration = {
  readonly label: string
  readonly duration: MeasuredTime
}

/**
 * 段ごとの所要時間の横棒グラフ（1つの HTML の塊）。段が無ければ空文字。
 * 棒の長さは測れた段のうち一番長い段に対する比で、測れなかった段は棒を出さず「不明」と書く。
 */
export function phaseTimesMarkdown(durations: readonly PhaseDuration[]): string {
  if (durations.length === 0) {
    return ""
  }
  const longest = Math.max(
    0,
    ...durations.map(({ duration }) => (duration.kind === "known" ? duration.milliseconds : 0)),
  )
  const rows = durations.map((phase) => phaseTimeRowMarkdown(phase, longest)).join("")
  return (
    `<div class="phase-times">` +
    `<div class="phase-times-heading">段ごとの時間</div>` +
    `<div role="table" aria-label="段ごとの所要時間">${rows}</div></div>`
  )
}

function phaseTimeRowMarkdown({ label, duration }: PhaseDuration, longest: number): string {
  const name = `<span class="phase-time-label">${htmlInline(label)}</span>`
  if (duration.kind === "unknown") {
    return (
      `<div class="phase-time" role="row">${name}` +
      `<span class="phase-time-value phase-time-unknown">不明</span></div>`
    )
  }
  const width = longest > 0 ? Math.round((duration.milliseconds / longest) * 100) : 0
  const time = formatElapsed(Math.round(duration.milliseconds / 1000))
  return (
    `<div class="phase-time" role="row">${name}` +
    `<span class="phase-time-track" aria-hidden="true">` +
    `<span class="phase-time-bar" style="width: ${String(width)}%"></span></span>` +
    `<span class="phase-time-value">${time}</span></div>`
  )
}
