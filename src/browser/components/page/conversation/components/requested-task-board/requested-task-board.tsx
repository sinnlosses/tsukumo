// 開くよう頼まれたタスクのモーダル（`useTaskBoardRequest`）。
// 狭い画面ではサイドバーとメインビューの片方が隠れる（`display: none` の中の `<dialog>` は開いても見えない）ので、どちらの領域にも入れず会話の画面に直に置く。

import type { ReactElement } from "react"

import { TaskBoard } from "../../../../../features/task-board/task-board.tsx"
import { useSession } from "../../../../../stores/session.ts"
import { useTaskBoardRequest } from "../../../../../stores/task-board-request.ts"

export function RequestedTaskBoard(): ReactElement {
  const tasks = useSession((session) => session.state.tasks)
  const request = useTaskBoardRequest((state) => state.request)
  const close = useTaskBoardRequest((state) => state.close)
  return <TaskBoard tasks={tasks} request={request} onClose={close} />
}
