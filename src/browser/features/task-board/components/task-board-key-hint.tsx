// タスクのモーダルの下端の帯の左に置く、キーの案内。

import type { ReactElement } from "react"

import { Kbd } from "../../../components/ui/kbd/kbd.tsx"
import styles from "./task-board-key-hint.module.css"

export function TaskBoardKeyHint(): ReactElement {
  return (
    <span className={styles["task-board-key-hint"]}>
      <Kbd keys="↑↓" /> 選ぶ <Kbd keys="⏎" /> 頼む <Kbd keys="Esc" /> 閉じる
    </span>
  )
}
