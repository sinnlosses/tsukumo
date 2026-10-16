// タスクの属性（難しさ・ループに載せてよいか）の見せ方。一覧の行はアイコンだけ、詳細は字の札。ラベル（任意のタグ）とは別の見た目。

import clsx from "clsx"
import { Repeat } from "lucide-react"
import type { ReactElement } from "react"

import type { TaskDifficulty, TaskLoopable } from "../../../../shared/repository/task-summary.ts"
import styles from "./task-attribute.module.css"

export type TaskAttributeValue =
  | { readonly kind: "difficulty"; readonly value: TaskDifficulty }
  | { readonly kind: "loopable"; readonly value: TaskLoopable }

const DIFFICULTY_LEVEL = {
  haiku: 1,
  sonnet: 2,
  opus: 3,
} satisfies Record<TaskDifficulty, number>

const DIFFICULTY_DOTS = [1, 2, 3] as const

/** 一覧の行の属性。難しさは点3つのうち段の数だけ塗り、`loopable` が `Y` のときだけループのアイコンを添える。字は出さない。 */
export function TaskRowAttributes(props: {
  readonly difficulty: TaskDifficulty | undefined
  readonly loopable: TaskLoopable | undefined
}): ReactElement {
  const difficulty = props.difficulty
  return (
    <span className={styles["task-attribute-group"]}>
      {props.loopable === "Y" && (
        <span className={styles["task-attribute-icon"]} role="img" aria-label="ループで回せる">
          <Repeat size={12} strokeWidth={2} aria-hidden="true" />
        </span>
      )}
      {difficulty !== undefined && (
        <span
          className={styles["task-attribute-dots"]}
          data-attribute="difficulty"
          role="img"
          aria-label={`難しさ ${difficulty}`}
        >
          {DIFFICULTY_DOTS.map((dot) => (
            <span
              key={dot}
              className={clsx(
                styles["task-attribute-dot"],
                dot <= DIFFICULTY_LEVEL[difficulty] && styles["task-attribute-dot-filled"],
              )}
            />
          ))}
        </span>
      )}
    </span>
  )
}

/** 詳細の情報の表の字の札。`loopable` が `N` のものだけ枠で目立たせる。 */
export function TaskAttribute(props: { readonly attribute: TaskAttributeValue }): ReactElement {
  const attribute = props.attribute
  const manual = attribute.kind === "loopable" && attribute.value === "N"
  return (
    <span
      className={clsx(styles["task-attribute"], manual && styles["task-attribute-manual"])}
      data-attribute={attribute.kind}
    >
      {attribute.value}
    </span>
  )
}
