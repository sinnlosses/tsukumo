// タスク一覧の表（サイドバーの区画の見出しから開くモーダル）の**入口**。ロジックは
// `hooks/use-task-board.ts` が持ち、見た目は `presentational-task-board.tsx` が持つ
// （docs/design.md 2章「機能の中を分ける」の container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { type TaskSummaryItem } from "../../../shared/task-summary.ts"
import { useTaskBoard } from "./hooks/use-task-board.ts"
import { PresentationalTaskBoard } from "./presentational-task-board.tsx"

export type TaskBoardProps = {
  readonly tasks: readonly TaskSummaryItem[] | undefined
  readonly open: boolean
  readonly onClose: () => void
}

export function TaskBoard(props: TaskBoardProps): ReactElement {
  // 分解して受けるのは、ref を持つ入れ物のまま描画中に読むと `react(refs)` が落ちるため
  // （`presentational-task-board.tsx` も同じ理由で props を分解している）。
  const { dialogRef, onDialogClick, rows } = useTaskBoard(props.tasks, props.open, props.onClose)

  return (
    <PresentationalTaskBoard
      rows={rows}
      ref={dialogRef}
      onClose={props.onClose}
      onDialogClick={onDialogClick}
    />
  )
}
