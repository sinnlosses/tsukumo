// タブの題（`TabTitle`）。局面と `report` の判定から、背面のタブでも読める印と短い語を元の題の頭に付ける。

import type { ReportJudgment } from "../../../../../shared/report/report-progress-field.ts"
import { conversationMoment } from "../../../../../shared/session/conversation-moment.ts"
import type { SessionRecord } from "../../../../../shared/session/session-record.ts"
import type { SessionState } from "../../../../../shared/session/session-state.ts"

const WORKING = "◐ 働いている"
const YOUR_TURN = "● あなたの番"
const HALTED = "■ 止めた"
const BROKE_OFF = "✕ 止まった"

const VERDICT_TITLES = {
  done: "✓ 済んだ",
  partial: "◐ 一部済んだ",
  yours: YOUR_TURN,
  stopped: HALTED,
  failed: BROKE_OFF,
} as const satisfies Record<ReportJudgment, string>

/**
 * タブに出す題。印と語があれば `<印> <語> ― <元の題>`、無ければ元の題のまま。
 * 雑談モードでは答え待ちのときだけ印を付ける（働く・渡すは仕事のセッションの局面）。
 */
export function tabTitleOf(state: SessionState, original: string): string {
  const headed = (head: string): string => `${head} ― ${original}`
  const moment = conversationMoment(state)
  if (moment === "ask") {
    return headed(YOUR_TURN)
  }
  if (state.chatMode) {
    return original
  }
  switch (moment) {
    case "greet":
      return original
    case "work":
      return headed(WORKING)
    case "stumble":
      return headed(BROKE_OFF)
    case "deliver":
      return headed(
        state.turn.kind === "finished" && state.turn.ending.kind === "interrupted"
          ? HALTED
          : VERDICT_TITLES[latestVerdictOf(state.records)],
      )
  }
}

/** いちばん新しい依頼より後ろの、最後の `report` の判定。`report` が無ければ `done`。 */
export function latestVerdictOf(records: readonly SessionRecord[]): ReportJudgment {
  const report = records
    .slice(records.findLastIndex((record) => record.kind === "request") + 1)
    .findLast((record) => record.kind === "report")
  return report?.kind === "report" ? report.verdict : "done"
}
