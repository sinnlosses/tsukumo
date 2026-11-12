// 新しい器「舞台と紙」のタスクの紙の中身。紙の見出しと閉じるは `<Sheet>` が持つので、ここは一覧と詳細だけを置く。
// 紙を開いている間は常に開いた一覧で、閉じる（頼んだあとも）は会話の画面へ戻ること。

import type { ReactElement } from "react"
import { createPortal } from "react-dom"

import { navigateTo } from "../../stores/screen.tsx"
import { useSession } from "../../stores/session.ts"
import type { TaskBoardRequest } from "../../stores/task-board-request.ts"
import { TaskRunConfirm } from "./components/task-run-confirm.tsx"
import { useTaskBoard } from "./hooks/use-task-board.ts"
import { TaskBoardFrame } from "./presentational-task-board.tsx"

const OPEN_FIRST = { kind: "open", focus: { kind: "first" } } satisfies TaskBoardRequest

export function TaskSheet(): ReactElement {
  const tasks = useSession((session) => session.state.tasks)
  const view = useTaskBoard(tasks, OPEN_FIRST, () => {
    navigateTo("conversation")
  })
  return (
    <>
      <TaskBoardFrame {...view} head={undefined} />
      {view.confirm.kind === "open" &&
        createPortal(
          <TaskRunConfirm target={view.confirm.target} onClose={view.onConfirmClose} />,
          document.body,
        )}
    </>
  )
}
