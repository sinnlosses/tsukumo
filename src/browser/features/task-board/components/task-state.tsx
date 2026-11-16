// タスクの状態の印と言い方（進行中・着手可・待ち <ID>・保留・ドラフト・完了・想定外の値）。
// 色だけで伝えないよう、印の形（`ui/icon` の絵）と語を持つ。

import clsx from "clsx"
import type { ReactElement } from "react"

import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  CirclePauseIcon,
  HourglassIcon,
} from "../../../components/ui/icon/icon.tsx"
import type { TaskStateKind, TaskStateView } from "../domain/task-board-view.ts"
import taskBoardStyles from "../task-board.module.css"
import styles from "./task-state.module.css"

export function TaskState(props: {
  readonly state: TaskStateView
  /** `mark` は印だけ（語は title）、`labeled` は印と語。 */
  readonly display: "mark" | "labeled"
}): ReactElement {
  return (
    <span
      className={clsx(taskBoardStyles["task-state"], TASK_STATE_CLASS[props.state.kind])}
      title={props.display === "mark" ? props.state.text : undefined}
    >
      <span className={styles["task-state-mark"]} aria-hidden={props.display === "labeled"}>
        <TaskStateIcon kind={props.state.kind} />
      </span>
      {props.display === "labeled" && (
        <span className={styles["task-state-text"]}>{props.state.text}</span>
      )}
    </span>
  )
}

const TASK_STATE_CLASS = {
  ready: styles["task-state-ready"],
  blocked: styles["task-state-blocked"],
  hold: styles["task-state-hold"],
  draft: styles["task-state-draft"],
  doing: styles["task-state-doing"],
  done: styles["task-state-done"],
  other: styles["task-state-other"],
} satisfies Record<TaskStateKind, string | undefined>

function TaskStateIcon(props: { readonly kind: TaskStateKind }): ReactElement {
  switch (props.kind) {
    case "doing":
      return <CircleDotIcon />
    case "ready":
      return <CircleIcon />
    case "blocked":
      return <HourglassIcon />
    case "hold":
      return <CirclePauseIcon />
    case "draft":
      return <CircleDashedIcon />
    case "done":
      return <CircleCheckIcon />
    case "other":
      return <CircleAlertIcon />
  }
}
