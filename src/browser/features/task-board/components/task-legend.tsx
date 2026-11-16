// 一覧の上の凡例1行。印（着手可・待ち・保留）と右端の `↻` の意味を言う。

import type { ReactElement } from "react"

import { LOOP_GLYPH } from "./task-item.tsx"
import styles from "./task-legend.module.css"
import { TaskState } from "./task-state.tsx"

export function TaskLegend(): ReactElement {
  return (
    <p className={styles["task-legend"]}>
      <span className={styles["task-legend-item"]}>
        <TaskState state={{ kind: "ready", text: "着手可" }} display="labeled" />
      </span>
      <span className={styles["task-legend-item"]}>
        <TaskState state={{ kind: "blocked", text: "待ち" }} display="labeled" />
      </span>
      <span className={styles["task-legend-item"]}>
        <TaskState state={{ kind: "hold", text: "保留" }} display="labeled" />
      </span>
      <span className={styles["task-legend-item"]}>
        <span className={styles["task-legend-loop"]}>{LOOP_GLYPH}</span>
        ループ可
      </span>
    </p>
  )
}
