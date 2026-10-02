// 中くらいの窓幅の柱に出す、進行中のタスクの件数のチップ。
// 読み上げは柱の口の名前に任せる。

import type { ReactElement } from "react"

import { taskListCounts } from "../../../../features/task-board/domain/task-list-count.ts"
import { useSession } from "../../../../stores/session.ts"
import styles from "./task-doing-count.module.css"

export function TaskDoingCount(): ReactElement | undefined {
  const tasks = useSession((session) => session.state.tasks)
  if (tasks.kind === "unknown") {
    return undefined
  }
  const doing = taskListCounts(tasks.items).find((item) => item.status === "doing")?.count ?? 0
  return (
    <span
      className={styles["task-doing-count"]}
      aria-hidden="true"
      title={`進行中 ${String(doing)}`}
    >
      {String(doing)}
    </span>
  )
}
