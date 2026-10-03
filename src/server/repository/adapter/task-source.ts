// タスク一覧の読み元の口。
// タスクの方式（ファイル方式・Beads）ごとに1つずつ実装があり、見張り（`watchTaskSummary`）がプロジェクトの設定から選んで見回りのたびに `read` を呼ぶ。
// 読み元は前回読んだものを自分で覚え、変わっていなければ読み直さずに `unchanged` を返してよい。

import type { TaskSummaryItem, TaskSummaryResult } from "../../../shared/repository/task-summary.ts"

/** 読み元が返す一覧。送る文面は設定の持ち物なので、読み元は持たず、見張りが `known` に付ける。 */
export type TaskSourceResult =
  | Exclude<TaskSummaryResult, { readonly kind: "known" }>
  | { readonly kind: "known"; readonly items: readonly TaskSummaryItem[] }

/**
 * 1回の見回りの結果。
 * - `unchanged`: 前回から変わっていない、またはこの回は諦めた（`git`・`bd` がタイムアウトした）。見張りは何も知らせない
 * - `read`: 読んだ結果。前回知らせたものと同じなら、見張りが知らせずに捨てる
 */
export type TaskSourceRead =
  | { readonly kind: "unchanged" }
  | { readonly kind: "read"; readonly result: TaskSourceResult }

export type TaskSource = {
  readonly read: () => Promise<TaskSourceRead>
}

/** いつ読んでも同じ結果を返す読み元（タスク運用なし・設定が読めない）。 */
export function fixedTaskSource(result: TaskSourceResult): TaskSource {
  return { read: () => Promise.resolve({ kind: "read", result }) }
}
