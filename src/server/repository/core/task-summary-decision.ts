// タスク一覧の見回りの結果から、知らせるかどうかと次の覚えを決める。

import { isDeepEqual } from "remeda"

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"

/** 一覧を出しているとき、読めなかった回がこの数だけ続いたら「不明」にする。 */
const MAX_FAILURE_STREAK_WITH_LIST = 3

/** 見回りのあいだ覚えておく状態。 */
export type TaskSummaryPollState = {
  /** 読んだ結果として最後に知らせたもの。覚えた一覧を知らせても `loading` のまま。 */
  readonly notified: TaskSummaryResult
  /** 覚えていた一覧を先に知らせたとき、その結果。読んだ結果で置き換わったら無くす。 */
  readonly shownFromMemory: TaskSummaryResult | undefined
  readonly failureStreak: number
}

/**
 * 1回の見回りの結果。
 * - `unchanged`: 前回から変わっていない、またはこの回は諦めた（`bd` がタイムアウトした）。見張りは何も知らせない
 * - `read`: 読んだ結果。前回知らせたものと同じなら、見張りが知らせずに捨てる
 */
export type TaskSourceRead =
  | { readonly kind: "unchanged" }
  | { readonly kind: "read"; readonly result: Exclude<TaskSummaryResult, { kind: "loading" }> }

export type TaskSummaryPollDecision = {
  readonly state: TaskSummaryPollState
  /** 知らせる結果。知らせないときは無い。`known` なら覚えにも書く。 */
  readonly deliver: TaskSummaryResult | undefined
}

export function decideTaskSummaryPoll(
  state: TaskSummaryPollState,
  read: TaskSourceRead,
): TaskSummaryPollDecision {
  const { notified, shownFromMemory } = state
  // 読み元は最初の読みでは、読んだ結果かタイムアウトで諦めた回しか返さない。
  // まだ何も知らせていないうちの `unchanged` は、読めなかった回として数える。
  const failed =
    read.kind === "unchanged" ? notified.kind === "loading" : read.result.kind === "unknown"
  const failureStreak = failed
    ? state.failureStreak + 1
    : read.kind === "read"
      ? 0
      : state.failureStreak
  const counted = { ...state, failureStreak }
  const showingList = notified.kind === "known" || shownFromMemory?.kind === "known"
  if (failed && showingList && failureStreak < MAX_FAILURE_STREAK_WITH_LIST) {
    return { state: counted, deliver: undefined }
  }
  // 一覧を出していない `unchanged` は、画面を読み込み中のままにしないため「不明」で知らせる。
  const result: TaskSummaryResult = read.kind === "unchanged" ? { kind: "unknown" } : read.result
  if (read.kind === "unchanged" && notified.kind !== "loading") {
    return { state: counted, deliver: undefined }
  }
  if (isDeepEqual(result, notified)) {
    return { state: counted, deliver: undefined }
  }
  const alreadyShown = isDeepEqual(result, shownFromMemory)
  return {
    state: { notified: result, shownFromMemory: undefined, failureStreak },
    deliver: alreadyShown ? undefined : result,
  }
}
