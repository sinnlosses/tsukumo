// 最終レポートの段ごとの所要時間の表の形と、HTML の組み立て。

import { formatElapsed, type MeasuredTime } from "../utils/elapsed-time.ts"
import { htmlInline } from "./report-markdown.ts"

/** 段1つの所要時間。`label` は段の見出しの字（「2/4 段の名前」）。 */
export type PhaseDuration = {
  readonly label: string
  readonly duration: MeasuredTime
}

/**
 * 段ごとの所要時間の表（1つの HTML の塊）。段が無ければ空文字。
 * 列は段と時間の2つで、測れなかった段は「不明」と書く。
 */
export function phaseTimesMarkdown(durations: readonly PhaseDuration[]): string {
  if (durations.length === 0) {
    return ""
  }
  const rows = durations.map(phaseTimeRowMarkdown).join("")
  return (
    `<div class="phase-times">` +
    `<div class="phase-times-heading">段ごとの時間</div>` +
    `<div role="table" aria-label="段ごとの所要時間">${rows}</div></div>`
  )
}

function phaseTimeRowMarkdown({ label, duration }: PhaseDuration): string {
  const value =
    duration.kind === "known"
      ? `<span class="phase-time-value">${formatElapsed(Math.round(duration.milliseconds / 1000))}</span>`
      : `<span class="phase-time-value phase-time-unknown">不明</span>`
  return (
    `<div class="phase-time" role="row">` +
    `<span class="phase-time-label">${htmlInline(label)}</span>${value}</div>`
  )
}
