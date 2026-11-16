// タスクのモーダルの頭の1行。題「タスク」と件数・検索欄・最新化・閉じる。
// 検索欄と件数は一覧が読めているときだけ置く（読み込み中・読めない・0件では題と口だけ）。

import type { ReactElement, ReactNode } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { CloseIcon } from "../../../components/ui/icon/icon.tsx"
import { TaskRefreshButton } from "../task-refresh-button.tsx"
import styles from "./task-board-head.module.css"

export function TaskBoardHead(props: {
  readonly listed:
    | { readonly kind: "none" }
    | { readonly kind: "some"; readonly total: number; readonly search: ReactNode }
  readonly onClose: () => void
}): ReactElement {
  const { listed } = props
  return (
    <div className={styles["task-board-head"]}>
      <h2 className={styles["task-board-title"]}>
        タスク
        {listed.kind === "some" && (
          <span className={styles["task-board-total"]}>{String(listed.total)}</span>
        )}
      </h2>
      <span className={styles["task-board-search-slot"]}>
        {listed.kind === "some" && listed.search}
      </span>
      <span className={styles["task-board-tools"]}>
        <TaskRefreshButton />
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
      </span>
    </div>
  )
}
