// タスクの作業先の札。サイドバーの行と一覧モードの行で同じ見た目にする。
// 長い名前は1行で省略記号に切り、全文は title に持つ。

import type { ReactElement } from "react"

import styles from "./task-work-repo.module.css"

export function TaskWorkRepo(props: { readonly name: string }): ReactElement {
  return (
    <span className={styles["task-work-repo"]} title={props.name}>
      {props.name}
    </span>
  )
}
