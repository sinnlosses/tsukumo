// タスクの一覧の外（探すなど）から1件のタスクを頼むときの文面。頼めるかの判定と文面はタスクの一覧と同じものを使う。

import { hasTaskStatus, type TaskSummaryItem } from "../../../shared/repository/task-summary.ts"
import { loadLaunchSkill } from "../../domain/launch-skill.ts"
import { isTaskRequestable, requestPromptOf } from "./domain/task-run-prompt.ts"

/** 着手の頼み。頼めないタスク（着手できない・待ちのある保留・済んだもの）は `not-requestable`。 */
export type TaskStartRequest =
  | { readonly kind: "requestable"; readonly prompt: string }
  | { readonly kind: "not-requestable" }

export function taskStartRequest(task: TaskSummaryItem): TaskStartRequest {
  if (!isTaskRequestable(task)) {
    return { kind: "not-requestable" }
  }
  const prompt = requestPromptOf(
    {
      kind: "task",
      taskId: task.id,
      request: { kind: "start", held: hasTaskStatus(task, "hold") },
    },
    loadLaunchSkill(),
  )
  return { kind: "requestable", prompt }
}
