// 任せた役（背景のサブエージェントとワークフロースクリプト）ごとの、進みの最新の1行を差し替える決まり。

import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { TaskId } from "../session-driver/task-id.ts"

/**
 * 任せた役1つ。`name` は顔ぶれに入ったときの `BackgroundTask.description`、`summary` は進みの最新の1行（まだ届いていなければ空）。
 * `state` は顔ぶれにいるあいだ `running`、外れたら `done`。`at` は最後に動いた（顔ぶれに入った・進みが届いた・外れた）時刻。
 * `name` と `summary` は会話から作られた字なので、画面に出すだけでログにもファイルにも書かない。
 */
export type DelegateRole = {
  readonly taskId: TaskId
  readonly name: string
  readonly state: "running" | "done"
  readonly summary: string
  readonly at: number
}

/** 顔ぶれが変わったあとの役。顔ぶれの `agent`・`workflow` を `running` で並べ（新しい役は空の1行）、外れた役は `done` にして残す。 */
export function delegateRolesOfTasks(
  roles: readonly DelegateRole[],
  tasks: readonly BackgroundTask[],
  at: number,
): readonly DelegateRole[] {
  const delegates = tasks.filter(isDelegate)
  const ids = new Set(delegates.map((task) => task.taskId))
  const left = roles.map((role) =>
    ids.has(role.taskId) || role.state === "done" ? role : { ...role, state: "done" as const, at },
  )
  const joined = delegates
    .filter((task) => !roles.some((role) => role.taskId === task.taskId))
    .map((task): DelegateRole => ({
      taskId: task.taskId,
      name: task.description,
      state: "running",
      summary: "",
      at,
    }))
  return [...left, ...joined]
}

/** 進みの1行が届いたあとの役。顔ぶれにいる役の1行だけを置き換え、いない役の進みは無視する。 */
export function delegateRolesWithProgress(
  roles: readonly DelegateRole[],
  tasks: readonly BackgroundTask[],
  taskId: TaskId,
  summary: string,
  at: number,
): readonly DelegateRole[] {
  const task = tasks.find((candidate) => candidate.taskId === taskId && isDelegate(candidate))
  if (task === undefined) {
    return roles
  }
  const updated: DelegateRole = { taskId, name: task.description, state: "running", summary, at }
  return roles.some((role) => role.taskId === taskId)
    ? roles.map((role) => (role.taskId === taskId ? updated : role))
    : [...roles, updated]
}

function isDelegate(task: BackgroundTask): boolean {
  return task.kind === "agent" || task.kind === "workflow"
}
