// 仕事のセッションの会話の画面がいまどの局面にあるか（`ConversationMoment`）。セッションの姿から導くだけで、状態は持たない。

import { mainViewEntries } from "./main-view.ts"
import type { SessionState } from "./session-state.ts"

/**
 * 局面。中身は迎える口（`greet`）・作業の地図（`work` / `ask`）・レポート（`deliver` / `stumble`）の3つ。
 * `ask` は `work` のうち答え待ちがあるもの、`stumble` は `deliver` のうち失敗かセッションの終わりで閉じたもの。
 */
export type ConversationMoment = "greet" | "work" | "ask" | "deliver" | "stumble"

export function conversationMoment(state: SessionState): ConversationMoment {
  if (!isExchangeClosed(state)) {
    return state.pending.length > 0 ? "ask" : "work"
  }
  if (!hasExchange(state)) {
    return "greet"
  }
  const failed = state.turn.kind === "finished" && state.turn.ending.kind === "failed"
  return failed || state.endedReason !== undefined ? "stumble" : "deliver"
}

/**
 * いちばん新しいやり取りが閉じているか。
 * ターンが `running` でなく、背景のタスクも残っていないときだけ true。
 * どちらかが残っているあいだは、次の合図で続きのターンが始まり、いま最後の `report` が中間レポートへ回るかもしれない。
 */
export function isExchangeClosed(state: SessionState): boolean {
  return state.turn.kind !== "running" && state.backgroundTasks.length === 0
}

/**
 * やり取りが1件でもあるか。依頼が無くても、メインビューに出るものがあれば数える
 * （セッションの途中から追い始めたときは、最初の依頼より前の記録だけがある）。
 */
function hasExchange(state: SessionState): boolean {
  return (
    state.records.some((record) => record.kind === "request") || mainViewEntries(state).length > 0
  )
}
