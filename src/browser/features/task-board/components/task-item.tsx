// 区画の一覧1件分（進行中を除いた「残り」。進行中は `task-running-card.tsx` が持つ）。先頭列に
// status の印（丸・チェック）、2列目に押せるID＋summary を置く2列の grid 行
// （`.task-item` の `grid-template-columns: auto 1fr`。`task-board.module.css`）。
//
// 色だけで状態を伝えない（docs/screen-design.md 13.1 原則1）: todo は空の丸、done はチェックの印
// （字も打ち消し線にする）、想定外の値は注意色の「!」にする。summary は1行に収め、
// 入りきらない分は末尾を「…」にする（全文を読みたいときは「一覧を見る」の表を開く）。

import clsx from "clsx"
import { type ReactElement } from "react"

import { type TaskSummaryItem } from "../../../../shared/task-summary.ts"
import styles from "../task-board.module.css"
import { TaskRunButton } from "./task-run-button.tsx"

export function TaskItem(props: { readonly task: TaskSummaryItem }): ReactElement {
  return (
    <li className={clsx(styles["task-item"], props.task.status === "done" && styles["task-done"])}>
      <span>
        <TaskMark status={props.task.status} />
      </span>
      <span className={styles["task-item-body"]}>
        <TaskRunButton taskId={props.task.id} />
        <span className={styles["task-item-summary"]}>{props.task.summary}</span>
      </span>
    </li>
  )
}

/**
 * status ごとの印。status が無い要素は印を出さない（`task-list.tsx` のフィクスチャの通り、
 * 一覧の要素そのものは壊れていないが status だけ読めない場合の扱い）。todo / done 以外
 * （想定外の値）は、詳しい文字列を持ち込まず注意色の印だけにする——読み手が詳細を見たいときは
 * 「一覧を見る」の表（`task-board.tsx`）に status の文字がそのまま出る。
 */
function TaskMark(props: { readonly status: string | undefined }): ReactElement | null {
  if (props.status === undefined) {
    return null
  }
  if (props.status === "todo") {
    return <span className={styles["task-mark-todo"]} title="未着手" />
  }
  if (props.status === "done") {
    return <span className={styles["task-mark-done"]} title="完了" />
  }
  return <span className={styles["task-mark-other"]} title={props.status} />
}
