// タスクの属性（ループに載せてよいか・難しさ）の見せ方。ループ可は ∞ の印、難しさはモデル名の語（目盛りつきもある）。ラベル（任意のタグ）とは別の見た目。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { TaskDifficulty, TaskLoopable } from "../../../../shared/repository/task-summary.ts"
import { InfinityIcon } from "../../../components/ui/icon/icon.tsx"
import styles from "./task-attribute.module.css"

const DIFFICULTY_LEVEL = {
  haiku: 1,
  sonnet: 2,
  opus: 3,
} satisfies Record<TaskDifficulty, number>

const DIFFICULTY_STEPS = [1, 2, 3] as const

/** ∞ の印。名前は `role="img"` の `aria-label` に持つ。 */
export function TaskLoopMark(props: { readonly label: string }): ReactElement {
  return (
    <span className={styles["task-attribute-icon"]} role="img" aria-label={props.label}>
      <InfinityIcon />
    </span>
  )
}

/** モデル名の語。`scale` のとき、語の前に3段の目盛りを添える。 */
export function TaskDifficultyWord(props: {
  readonly difficulty: TaskDifficulty
  readonly scale: boolean
}): ReactElement {
  const { difficulty } = props
  return (
    <span className={styles["task-attribute-difficulty"]} data-attribute="difficulty">
      {props.scale && (
        <span className={styles["task-attribute-scale"]} aria-hidden="true">
          {DIFFICULTY_STEPS.map((step) => (
            <i
              key={step}
              className={clsx(
                styles["task-attribute-step"],
                step <= DIFFICULTY_LEVEL[difficulty] && styles["task-attribute-step-on"],
              )}
            />
          ))}
        </span>
      )}
      {difficulty}
    </span>
  )
}

/** 詳細の情報の表のループの行。`Y` は ∞ と「ループ可」、`N` は「手で進める」。 */
export function TaskLoopableText(props: { readonly loopable: TaskLoopable }): ReactElement {
  if (props.loopable === "Y") {
    return (
      <span className={styles["task-attribute-group"]} data-attribute="loopable">
        <span className={styles["task-attribute-icon"]} aria-hidden="true">
          <InfinityIcon />
        </span>
        ループ可
      </span>
    )
  }
  return (
    <span className={styles["task-attribute-group"]} data-attribute="loopable">
      手で進める
    </span>
  )
}
