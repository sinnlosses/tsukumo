// サイドシート（サイドバーの行から開く、タスク1件の非モーダルの詳細と、ドラフトの分類の場面）の入口。
// 開いている面（`useTaskSheet` の `sheet`）は置き場が読んで渡す。

import type { ReactElement } from "react"

import type { TaskSummaryResult } from "../../../shared/repository/task-summary.ts"
import type { TaskSheetSubject } from "../../stores/task-sheet.ts"
import { useDraftSortSheet } from "./hooks/use-draft-sort-sheet.ts"
import { useTaskSheetView } from "./hooks/use-task-sheet-view.ts"
import { PresentationalDraftSortSheet } from "./presentational-draft-sort-sheet.tsx"
import { PresentationalTaskSheet } from "./presentational-task-sheet.tsx"

export function TaskSheet(props: {
  readonly tasks: TaskSummaryResult
  readonly sheet: TaskSheetSubject
  /** タスクのモーダルが置かれている画面か。真のときだけ「一覧モードで開く」を出す。 */
  readonly listModeAvailable: boolean
}): ReactElement {
  const { sheet } = props
  if (sheet.kind === "sort") {
    return <DraftSortSheet tasks={props.tasks} />
  }
  return (
    <TaskDetailSheet
      tasks={props.tasks}
      sheet={sheet}
      listModeAvailable={props.listModeAvailable}
    />
  )
}

function TaskDetailSheet(props: {
  readonly tasks: TaskSummaryResult
  readonly sheet: Exclude<TaskSheetSubject, { readonly kind: "sort" }>
  readonly listModeAvailable: boolean
}): ReactElement {
  return (
    <PresentationalTaskSheet
      view={useTaskSheetView(props.tasks, props.sheet, props.listModeAvailable)}
    />
  )
}

function DraftSortSheet(props: { readonly tasks: TaskSummaryResult }): ReactElement {
  return <PresentationalDraftSortSheet view={useDraftSortSheet(props.tasks)} />
}
