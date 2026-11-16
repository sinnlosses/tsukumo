// 開くよう頼まれたタスクのモーダル（`useTaskBoardRequest`）と、サイドバーの行から開くサイドシート（`useTaskSheet`）。
//
// モーダルは、狭い画面ではサイドバーとメインビューの片方が隠れる（`display: none` の中の `<dialog>` は開いても見えない）ので、どちらの領域にも入れず会話の画面に直に置く。
// サイドシートは `<ConversationLayout>` の差し込み口 `sheet` に置く。

import type { ReactElement } from "react"

import { TaskBoard } from "../../../../../features/task-board/task-board.tsx"
import { TaskSheet } from "../../../../../features/task-board/task-sheet.tsx"
import { useSession } from "../../../../../stores/session.ts"
import { useTaskBoardRequest } from "../../../../../stores/task-board-request.ts"
import { useTaskSheet } from "../../../../../stores/task-sheet.ts"

export function RequestedTaskBoard(): ReactElement {
  const tasks = useSession((session) => session.state.tasks)
  const request = useTaskBoardRequest((state) => state.request)
  const close = useTaskBoardRequest((state) => state.close)
  return <TaskBoard tasks={tasks} request={request} onClose={close} />
}

/** `listModeAvailable` は、`RequestedTaskBoard` を置いている画面（仕事）か。 */
export function RequestedTaskSheet(props: { readonly listModeAvailable: boolean }): ReactElement {
  const tasks = useSession((session) => session.state.tasks)
  const sheet = useTaskSheet((state) => state.sheet)
  return <TaskSheet tasks={tasks} sheet={sheet} listModeAvailable={props.listModeAvailable} />
}
