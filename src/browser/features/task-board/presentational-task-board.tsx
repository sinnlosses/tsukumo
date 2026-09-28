// タスク一覧の表（サイドバーの区画の見出しから開くモーダル）の器だけ。
// フックも算出も持たず、受け取った値と呼び先をそのまま置く。
//
// `<dialog>` は top layer に出るので、サイドバー領域の `overflow` には切り取られない。

import type { ReactElement } from "react"

import { Button } from "../../components/ui/button/button.tsx"
import { Dialog } from "../../components/ui/dialog/dialog.tsx"
import { Heading } from "../../components/ui/heading/heading.tsx"
import { TaskTable } from "./components/task-table.tsx"
import type { BoardRow } from "./hooks/use-task-board.ts"
import styles from "./task-board.module.css"

export type PresentationalTaskBoardProps = {
  readonly rows: readonly BoardRow[] | undefined
  readonly open: boolean
  readonly onClose: () => void
}

export function PresentationalTaskBoard({
  rows,
  open,
  onClose,
}: PresentationalTaskBoardProps): ReactElement {
  return (
    <Dialog
      open={open}
      name={{ kind: "label", label: "タスク一覧" }}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={onClose}
      className={styles["task-board"]}
    >
      <div className={styles["task-board-body"]}>
        <div className={styles["task-board-head"]}>
          <Heading level={2} size="heading" tone="inherit" weight="semibold" className="">
            タスク一覧
          </Heading>
          <Button
            type="button"
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["task-board-close"]}
            onClick={onClose}
          >
            閉じる
          </Button>
        </div>
        <TaskTable rows={rows} />
      </div>
    </Dialog>
  )
}
