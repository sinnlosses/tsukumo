// 「tsukumo に頼む」で頼めるタスクと、送る文面。

import { hasTaskStatus, taskReadiness, type TaskSummaryItem } from "./task-summary.ts"

const HELD_NOTE = "このタスクは保留なので、着手の前に判断を聞いて。"

/** 頼みの種類。`start` は着手、`plan`・`drop` はドラフトの計画と却下。 */
export type TaskRequest =
  | { readonly kind: "start"; readonly held: boolean }
  | { readonly kind: "plan" }
  | { readonly kind: "drop" }

/** 着手できる `todo` と、待ちの無い保留。保留は文面が着手の前に判断を尋ねさせるので頼める。 */
export function isTaskRequestable(task: TaskSummaryItem): boolean {
  if (hasTaskStatus(task, "hold")) {
    return task.waitingFor.length === 0
  }
  return taskReadiness(task)?.kind === "ready"
}

/** 頼みの文面。保留のタスクの着手には、着手の前に判断を聞く旨を末尾に添える。 */
export function requestPromptOf(taskId: string, request: TaskRequest): string {
  switch (request.kind) {
    case "start": {
      const prompt = `タスク ${taskId} を進めて（bd show ${taskId} で読める）。`
      return request.held ? `${prompt}${HELD_NOTE}` : prompt
    }
    case "plan":
      return `ドラフト ${taskId} を計画して（bd show ${taskId} で読める）。## 完了条件 と ## やること を書いて、着手できる todo にする。`
    case "drop":
      return `ドラフト ${taskId} を却下して（bd show ${taskId} で読める）。理由を ## 結果 に書いて、dropped で閉じる。`
  }
}
