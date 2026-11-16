// タスクのモーダルの見出しの帯。「タスク」・更新ボタン・キーの案内・閉じるボタン。

import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { CloseIcon } from "../../../components/ui/icon/icon.tsx"
import { TaskRefreshButton } from "../task-refresh-button.tsx"
import styles from "./task-board-head.module.css"

export function TaskBoardHead(props: { readonly onClose: () => void }): ReactElement {
  return (
    <div className={styles["task-board-head"]}>
      <span className={styles["task-board-lead"]}>
        <h2 className={styles["task-board-title"]}>タスク</h2>
        <TaskRefreshButton />
      </span>
      <span className={styles["task-board-hints"]}>
        <kbd>↑↓</kbd> 選ぶ <kbd>Esc</kbd> 閉じる
      </span>
      <Button
        variant="ghost"
        size="action"
        pressed="none"
        disabled={false}
        ariaLabel="閉じる"
        disclosure={{ kind: "none" }}
        className={styles["task-board-close"]}
        onClick={props.onClose}
      >
        <CloseIcon />
      </Button>
    </div>
  )
}
