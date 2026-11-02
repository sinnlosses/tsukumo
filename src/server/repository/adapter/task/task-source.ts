// タスク一覧の読み元の口。
// 見張り（`watchTaskSummary`）が見回りのたびに `read` を呼ぶ。
// 読み元は前回読んだものを自分で覚え、変わっていなければ読み直さずに `unchanged` を返してよい。

import type { TaskSourceRead } from "../../core/task-summary-decision.ts"

export type TaskSource = {
  readonly read: () => Promise<TaskSourceRead>
}
