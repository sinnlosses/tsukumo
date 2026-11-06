// バックグラウンドのタスク・ワークフロースクリプトの ID（SDK の `task_id`）を、空でないと検査した型。

/**
 * 空でないタスクの ID。SDK が `task_id` に振る値で、Beads のタスクの ID ではない。
 * 作れるのは {@link isTaskId} を通した文字列だけ。
 */
export type TaskId = string & { readonly __brand: "TaskId" }

/** タスクの ID なら検査済みの型にして返す。文字列でない値・空の文字列は undefined。 */
export function parseTaskId(value: unknown): TaskId | undefined {
  return typeof value === "string" && isTaskId(value) ? value : undefined
}

/** タスクの ID か。型ガードなので、通した値は {@link TaskId} になる。 */
function isTaskId(value: string): value is TaskId {
  return value.length > 0
}
