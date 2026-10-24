// タスク一覧が届くまでの行の形をしたスケルトン。
// 読み上げには「読み込み中」だけを伝え、帯そのものは隠す。

import type { ReactElement } from "react"

import { Skeleton } from "../../../components/ui/skeleton/skeleton.tsx"
import styles from "../task-board.module.css"

const SKELETON_WIDTHS = ["88%", "72%", "80%"] as const

export function TaskSkeleton(): ReactElement {
  return (
    <div role="status" aria-label="タスクを読み込み中" className={styles["task-skeleton"]}>
      {SKELETON_WIDTHS.map((width) => (
        <Skeleton key={width} className={styles["task-skeleton-bar"]} style={{ width }}>
          {null}
        </Skeleton>
      ))}
    </div>
  )
}
