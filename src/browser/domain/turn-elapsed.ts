// 依頼を送ってからの経過（進行中）・所要（終わったあと）の語と字。
//
// ターンが終わっていても `backgroundTasks` が残っている間は「経過」のまま数え続け、残っていないターンの終わりで初めてその時刻に止まる。

import type { TurnProgress } from "../../shared/session/session-state.ts"
import { formatElapsed } from "../../shared/utils/elapsed-time.ts"

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
  return turn.kind === "idle"
    ? "-"
    : formatElapsed(turnElapsedSeconds(turn, backgroundTaskCount, now))
}

/**
 * {@link turnElapsedText} と同じ経過を、狭い画面の頭に出す「20:03」（1時間を超えたら「1:02:03」）の形にする。
 * まだ一度も依頼が無ければ `-`。
 */
export function turnElapsedClock(
  turn: TurnProgress,
  backgroundTaskCount: number,
  now: number,
): string {
  if (turn.kind === "idle") {
    return "-"
  }
  const totalSeconds = turnElapsedSeconds(turn, backgroundTaskCount, now)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secondsText = String(totalSeconds % 60).padStart(2, "0")
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${secondsText}`
    : `${String(minutes)}:${secondsText}`
}

/** 依頼を送ってからの秒。数え終わったターンは終わった時刻で固定される。 */
function turnElapsedSeconds(
  turn: Exclude<TurnProgress, { readonly kind: "idle" }>,
  backgroundTaskCount: number,
  now: number,
): number {
  const until = turn.kind === "finished" && backgroundTaskCount === 0 ? turn.finishedAt : now
  return Math.max(0, Math.floor((until - turn.startedAt) / 1000))
}
