// タスクの状態の印と言い方（着手できる・待ち <ID>・保留・進行中・完了・取り下げ・想定外の値）。
// 一覧の行・詳細の情報の表・依存の札で同じものを出す。色だけで伝えないよう、印の形と字を添える。

import clsx from "clsx"
import { Check, Minus, Pause } from "lucide-react"
import type { ReactElement } from "react"

import type { TaskStateKind, TaskStateView } from "../hooks/use-task-board.ts"
import taskBoardStyles from "../task-board.module.css"
import styles from "./task-state.module.css"

export function TaskState(props: { readonly state: TaskStateView }): ReactElement {
  return (
    <span className={clsx(taskBoardStyles["task-state"], TASK_STATE_CLASS[props.state.kind])}>
      <TaskStateMark kind={props.state.kind} />
      <span className={styles["task-state-text"]}>{props.state.text}</span>
    </span>
  )
}

const TASK_STATE_CLASS = {
  ready: styles["task-state-ready"],
  blocked: styles["task-state-blocked"],
  hold: styles["task-state-hold"],
  doing: styles["task-state-doing"],
  done: styles["task-state-done"],
  dropped: styles["task-state-dropped"],
  other: styles["task-state-other"],
} satisfies Record<TaskStateKind, string | undefined>

function TaskStateMark(props: { readonly kind: TaskStateKind }): ReactElement {
  if (props.kind === "hold") {
    return <Pause size={11} strokeWidth={2.4} aria-hidden="true" />
  }
  if (props.kind === "done") {
    return <Check size={11} strokeWidth={2.4} aria-hidden="true" />
  }
  if (props.kind === "dropped") {
    return <Minus size={11} strokeWidth={2.4} aria-hidden="true" />
  }
  return <span className={styles["task-state-mark"]} aria-hidden="true" />
}
