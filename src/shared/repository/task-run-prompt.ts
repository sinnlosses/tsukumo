// 「tsukumo に頼む」で頼めるタスクと、送る文面。

import { taskReadiness, type TaskSummaryItem } from "./task-summary.ts"

const HELD_NOTE = "このタスクは保留なので、着手の前に判断を聞いて。"

/** 着手できる `todo` と、待ちの無い保留。保留は文面が着手の前に判断を尋ねさせるので頼める。 */
export function isTaskRequestable(task: TaskSummaryItem): boolean {
  if (task.status === "hold") {
    return task.waitingFor.length === 0
  }
  return taskReadiness(task)?.kind === "ready"
}

/** 保留のタスクには、着手の前に判断を聞く旨を末尾に添える。 */
export function runPromptOf(taskId: string, held: boolean): string {
  const prompt = `タスク ${taskId} を進めて（bd show ${taskId} で読める）。`
  return held ? `${prompt}${HELD_NOTE}` : prompt
}
