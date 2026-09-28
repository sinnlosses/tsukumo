// タスク一覧の表（サイドバーの区画の見出しから開くモーダル）の入口。

import type { ReactElement } from "react"

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import { BoardCloseContext } from "./board-close.tsx"
import { useTaskBoard } from "./hooks/use-task-board.ts"
import { PresentationalTaskBoard } from "./presentational-task-board.tsx"

export type TaskBoardProps = {
  readonly tasks: TaskSummaryResult
  readonly open: boolean
  readonly onClose: () => void
}

export function TaskBoard(props: TaskBoardProps): ReactElement {
  // 表の中で開く確認が、送ったあとにこの表も閉じられるようにする。
  return (
    <BoardCloseContext.Provider value={props.onClose}>
      <PresentationalTaskBoard {...useTaskBoard(props.tasks, props.open)} onClose={props.onClose} />
    </BoardCloseContext.Provider>
  )
}
