// status ごとの印（サイドバーの行とのぞき窓の状態の行）。色だけで状態を伝えない。
// todo は空の丸、doing は塗った丸、done はチェック、想定外の値は注意色の「!」。status が読めない要素は印を出さない。

import type { ReactElement } from "react"

import styles from "./task-mark.module.css"

export function TaskMark(props: { readonly status: string | undefined }): ReactElement | null {
  if (props.status === undefined) {
    return null
  }
  if (props.status === "todo") {
    return <span className={styles["task-mark-todo"]} title="未着手" />
  }
  if (props.status === "doing") {
    return <span className={styles["task-mark-doing"]} title="進行中" />
  }
  if (props.status === "done") {
    return <span className={styles["task-mark-done"]} title="完了" />
  }
  return <span className={styles["task-mark-other"]} title={props.status} />
}
