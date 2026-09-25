// タスク一覧の表（サイドバーの区画の見出しから開くモーダル）の**入口**。ロジックは
// `hooks/use-task-board.ts` が持ち、見た目は `presentational-task-board.tsx` が持つ
// （docs/design.md 2章「機能の中を分ける」の container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { type TaskSummaryResult } from "../../../shared/task-summary.ts"
import { BoardCloseContext } from "./board-close.tsx"
import { useTaskBoard } from "./hooks/use-task-board.ts"
import { PresentationalTaskBoard } from "./presentational-task-board.tsx"

export type TaskBoardProps = {
  readonly tasks: TaskSummaryResult
  readonly open: boolean
  readonly onClose: () => void
}

export function TaskBoard(props: TaskBoardProps): ReactElement {
  // 表の中で開く確認が、送ったあとにこの表も閉じられるようにする（`board-close.tsx`）。
  return (
    <BoardCloseContext.Provider value={props.onClose}>
      <PresentationalTaskBoard {...useTaskBoard(props.tasks, props.open)} onClose={props.onClose} />
    </BoardCloseContext.Provider>
  )
}
