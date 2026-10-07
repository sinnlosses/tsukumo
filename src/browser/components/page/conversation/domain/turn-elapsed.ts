// 依頼を送ってからの経過（進行中）・所要（終わったあと）の語と字。
//
// ターンが終わっていても `backgroundTasks` が残っている間は「経過」のまま数え続け、残っていないターンの終わりで初めてその時刻に止まる。

import type { TurnProgress } from "../../../../../shared/session/session-state.ts"
import { formatElapsed } from "../../../../../shared/utils/elapsed-time.ts"

const ELAPSED_LABEL = "経過"
export const FINISHED_LABEL = "所要"
/** 失敗で終わったターンの経過時間に添える字（「所要」の代わり）。 */
const FAILED_LABEL = "失敗"

/** 依頼を送ってから、まだ数え続けているか。ターンが終わっていても背景のタスクが残っている間は数える。 */
export function isTurnCounting(turn: TurnProgress, backgroundTaskCount: number): boolean {
  return turn.kind === "running" || (turn.kind === "finished" && backgroundTaskCount > 0)
}

/** 経過時間に添える字。{@link isTurnCounting} の間は「経過」、そうでなければ「所要」・「失敗」。 */
export function turnElapsedLabel(turn: TurnProgress, backgroundTaskCount: number): string {
  if (turn.kind !== "finished" || backgroundTaskCount > 0) {
    return ELAPSED_LABEL
  }
  return turn.ending.kind === "failed" ? FAILED_LABEL : FINISHED_LABEL
}

/**
 * 経過（進行中）・所要（終わったあと）として出す文字列。まだ一度も依頼が無ければ `-`。
 * `now` を使うのは {@link isTurnCounting} の間だけで、数え終わったターンは終わった時刻で固定される。
 */
export function turnElapsedText(
  turn: TurnProgress,
  backgroundTaskCount: number,
  now: number,
): string {
  if (turn.kind === "idle") {
    return "-"
  }
  if (turn.kind === "finished" && backgroundTaskCount === 0) {
    return formatElapsed(Math.max(0, Math.floor((turn.finishedAt - turn.startedAt) / 1000)))
  }
  return formatElapsed(Math.max(0, Math.floor((now - turn.startedAt) / 1000)))
}
