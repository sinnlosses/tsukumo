// 難易度。点3つのうち haiku 1・sonnet 2・opus 3 を塗り、名前も添える（色で分けない）。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { TaskDifficultyView } from "../hooks/use-task-board.ts"
import styles from "../task-board.module.css"

const DOTS = [1, 2, 3] as const

export function TaskDifficulty(props: { readonly difficulty: TaskDifficultyView }): ReactElement {
  const difficulty = props.difficulty
  return (
    <span className={styles["task-difficulty"]}>
      {difficulty.level > 0 && (
        <span className={styles["task-difficulty-dots"]} aria-hidden="true">
          {DOTS.map((dot) => (
            <span
              key={dot}
              className={clsx(
                styles["task-difficulty-dot"],
                dot <= difficulty.level && styles["task-difficulty-dot-filled"],
              )}
            />
          ))}
        </span>
      )}
      {difficulty.text}
    </span>
  )
}
