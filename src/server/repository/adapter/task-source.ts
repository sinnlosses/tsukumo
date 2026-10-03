// タスク一覧の読み元の口。
// タスクの方式（ファイル方式・Beads）ごとに1つずつ実装があり、見張り（`watchTaskSummary`）がプロジェクトの設定から選んで見回りのたびに `read` を呼ぶ。
// 読み元は前回読んだものを自分で覚え、変わっていなければ読み直さずに `unchanged` を返してよい。

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"

/**
 * 1回の見回りの結果。
 * - `unchanged`: 前回から変わっていない、またはこの回は諦めた（`git`・`bd` がタイムアウトした）。見張りは何も知らせない
 * - `read`: 読んだ結果。前回知らせたものと同じなら、見張りが知らせずに捨てる
 */
export type TaskSourceRead =
  | { readonly kind: "unchanged" }
  | { readonly kind: "read"; readonly result: TaskSummaryResult }

export type TaskSource = {
  readonly read: () => Promise<TaskSourceRead>
}

/** いつ読んでも同じ結果を返す読み元（タスク運用なし・設定が読めない）。 */
export function fixedTaskSource(result: TaskSummaryResult): TaskSource {
  return { read: () => Promise.resolve({ kind: "read", result }) }
}
