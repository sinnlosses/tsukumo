import { parseTaskId, type TaskId } from "../../src/shared/session-driver/task-id.ts"

/** タスクの ID として通る文字列を検査済みの型にする。通らない文字列を渡したテストの書き間違いは throw で落とす。 */
export function checkedTaskId(value: string): TaskId {
  const taskId = parseTaskId(value)
  if (taskId === undefined) {
    throw new Error(`タスクの ID として通らない: ${value}`)
  }
  return taskId
}
