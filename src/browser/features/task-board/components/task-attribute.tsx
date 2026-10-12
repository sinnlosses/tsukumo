// タスクの属性（難しさ・ループに載せてよいか）の札。ラベル（任意のタグ）とは別の見た目。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { TaskDifficulty, TaskLoopable } from "../../../../shared/repository/task-summary.ts"
import styles from "./task-attribute.module.css"

export type TaskAttributeValue =
  | { readonly kind: "difficulty"; readonly value: TaskDifficulty }
  | { readonly kind: "loopable"; readonly value: TaskLoopable }

/** 一覧の行の属性。難しさの字と、`loopable` が `N` のときだけの札。どちらも無ければ空の入れ物。 */
export function TaskRowAttributes(props: {
  readonly difficulty: TaskDifficulty | undefined
  readonly loopable: TaskLoopable | undefined
}): ReactElement {
  return (
    <span className={styles["task-attribute-group"]}>
      {props.difficulty !== undefined && (
        <TaskAttribute attribute={{ kind: "difficulty", value: props.difficulty }} scope="row" />
      )}
      {props.loopable === "N" && (
        <TaskAttribute attribute={{ kind: "loopable", value: props.loopable }} scope="row" />
      )}
    </span>
  )
}

export function TaskAttribute(props: {
  readonly attribute: TaskAttributeValue
  readonly scope: "row" | "detail"
}): ReactElement {
  const attribute = props.attribute
  const manual = attribute.kind === "loopable" && attribute.value === "N"
  return (
    <span
      className={clsx(styles["task-attribute"], manual && styles["task-attribute-manual"])}
      data-attribute={attribute.kind}
    >
      {props.scope === "row" && attribute.kind === "loopable"
        ? `loop:${attribute.value}`
        : attribute.value}
    </span>
  )
}
