// 一覧の上の凡例1行。印（着手できる・依存待ち・hold）と右端の `↻` の意味を言う。

import type { ReactElement } from "react"

import { LOOP_GLYPH } from "./task-item.tsx"
import styles from "./task-legend.module.css"
import { TaskMark } from "./task-mark.tsx"

export function TaskLegend(): ReactElement {
  return (
    <p className={styles["task-legend"]}>
      <span className={styles["task-legend-item"]}>
        <TaskMark status={{ kind: "known", status: "todo" }} waiting={false} />
        着手できる
      </span>
      <span className={styles["task-legend-item"]}>
        <TaskMark status={{ kind: "known", status: "todo" }} waiting={true} />
        依存待ち
      </span>
      <span className={styles["task-legend-item"]}>
        <TaskMark status={{ kind: "known", status: "hold" }} waiting={false} />
        hold
      </span>
      <span className={styles["task-legend-item"]}>
        <span className={styles["task-legend-loop"]}>{LOOP_GLYPH}</span>
        ループ可
      </span>
    </p>
  )
}
