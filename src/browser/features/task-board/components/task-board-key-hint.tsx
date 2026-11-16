// タスクのモーダルの下端の帯の左に置く、キーの案内。

import type { ReactElement } from "react"

import styles from "./task-board-key-hint.module.css"

export function TaskBoardKeyHint(): ReactElement {
  return (
    <span className={styles["task-board-key-hint"]}>
      <kbd>↑↓</kbd> 選ぶ <kbd>⏎</kbd> 頼む <kbd>Esc</kbd> 閉じる
    </span>
  )
}
