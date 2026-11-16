// サイドシート（サイドバーの行から開く、タスク1件の非モーダルの詳細）の入口。
// 開いているタスク（`useTaskSheet` の `sheet`）は置き場が読んで渡す。

import type { ReactElement } from "react"

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import type { TaskSheetSubject } from "../../stores/task-sheet.ts"
import { useTaskSheetView } from "./hooks/use-task-sheet-view.ts"
import { PresentationalTaskSheet } from "./presentational-task-sheet.tsx"

export function TaskSheet(props: {
  readonly tasks: TaskSummaryResult
  readonly sheet: TaskSheetSubject
  /** タスクのモーダルが置かれている画面か。真のときだけ「一覧モードで開く」を出す。 */
  readonly listModeAvailable: boolean
}): ReactElement {
  return (
    <PresentationalTaskSheet
      view={useTaskSheetView(props.tasks, props.sheet, props.listModeAvailable)}
    />
  )
}
