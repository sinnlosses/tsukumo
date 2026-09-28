// タスクのモーダルの見出しの帯。「タスク」・件数・キーの案内・閉じるボタン。

import { X } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import styles from "../task-board.module.css"

export function TaskBoardHead(props: {
  /** 空文字列なら件数を出さない（一覧が読めないとき）。 */
  readonly countsText: string
  readonly onClose: () => void
}): ReactElement {
  return (
    <div className={styles["task-board-head"]}>
      <h2 className={styles["task-board-title"]}>タスク</h2>
      {props.countsText !== "" && (
        <span className={styles["task-board-counts"]}>{props.countsText}</span>
      )}
      <span className={styles["task-board-hints"]}>
        <kbd>↑↓</kbd> 選ぶ <kbd>Esc</kbd> 閉じる
      </span>
      <Button
        type="button"
        variant="outline"
        size="subheading"
        pressed="none"
        disabled={false}
        ariaLabel="閉じる"
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["task-board-close"]}
        onClick={props.onClose}
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </Button>
    </div>
  )
}
