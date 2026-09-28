// タスクのモーダル（サイドバーの区画の見出しの「一覧を見る」から開く、左に一覧・右に詳細のモーダル）の入口。

import type { ReactElement } from "react"

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import { useTaskBoard } from "./hooks/use-task-board.ts"
import { PresentationalTaskBoard } from "./presentational-task-board.tsx"

export type TaskBoardProps = {
  readonly tasks: TaskSummaryResult
  readonly open: boolean
  readonly onClose: () => void
}

export function TaskBoard(props: TaskBoardProps): ReactElement {
  return <PresentationalTaskBoard {...useTaskBoard(props.tasks, props.open, props.onClose)} />
}
