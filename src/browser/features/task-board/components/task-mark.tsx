// status ごとの印（サイドバーの行とのぞき窓の状態の行）。色だけで状態を伝えない。
// todo は空の丸、draft は破線の丸、doing は塗った丸、done はチェック、想定外の値は注意色の「!」。status が読めない要素は印を出さない。

import type { ReactElement } from "react"

import type { TaskSummaryStatus } from "../../../../shared/repository/task-summary.ts"
import styles from "./task-mark.module.css"

export function TaskMark(props: { readonly status: TaskSummaryStatus }): ReactElement | null {
  const { status } = props
  if (status.kind === "none") {
    return null
  }
  if (status.kind === "other") {
    return <span className={styles["task-mark-other"]} title={status.raw} />
  }
  switch (status.status) {
    case "todo":
      return <span className={styles["task-mark-todo"]} title="未着手" />
    case "draft":
      return <span className={styles["task-mark-draft"]} title="ドラフト" />
    case "doing":
      return <span className={styles["task-mark-doing"]} title="進行中" />
    case "done":
      return <span className={styles["task-mark-done"]} title="完了" />
    case "hold":
      return <span className={styles["task-mark-other"]} title={status.status} />
  }
}
