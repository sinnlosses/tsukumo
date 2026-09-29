// タスクのモーダル（左に一覧・右に詳細のモーダル）の入口。

import type { ReactElement } from "react"

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import type { TaskBoardRequest } from "../../stores/task-board-request.ts"
import { useTaskBoard } from "./hooks/use-task-board.ts"
import { PresentationalTaskBoard } from "./presentational-task-board.tsx"

export type TaskBoardProps = {
  readonly tasks: TaskSummaryResult
  readonly request: TaskBoardRequest
  readonly onClose: () => void
}

export function TaskBoard(props: TaskBoardProps): ReactElement {
  return <PresentationalTaskBoard {...useTaskBoard(props.tasks, props.request, props.onClose)} />
}
