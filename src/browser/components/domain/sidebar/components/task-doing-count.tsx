// 中くらいの窓幅の柱に出す、進行中のタスクの件数のチップ。
// 読み上げは柱の口の名前に任せる。

import type { ReactElement } from "react"

import { useSession } from "../../../../stores/session.ts"
import styles from "./task-doing-count.module.css"

export function TaskDoingCount(): ReactElement | undefined {
  const tasks = useSession((session) => session.state.tasks)
  if (tasks.kind !== "known") {
    return undefined
  }
  const doing = tasks.items.filter((task) => task.status === "doing").length
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
