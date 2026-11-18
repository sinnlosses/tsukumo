// サイドシートの分類の場面の器だけ。フックも算出も持たず、受け取った値と呼び先をそのまま置く。
//
// 中身（題・札・下端の口）は `DraftSortPanel`・`DraftSortBand` で、ここは3段の grid の器に入れる。
// 確認（`TaskRunConfirm`）はモーダルの `<dialog>` で最上位の層に出るので、サイドシートの上に重なる。

import type { ReactElement } from "react"

import { DraftSortBand, DraftSortPanel } from "./components/draft-sort-panel.tsx"
import { TaskRunConfirm } from "./components/task-run-confirm.tsx"
import sheetStyles from "./components/task-sheet.module.css"
import { TASK_SHEET_DOM_ID } from "./domain/task-row-dom-id.ts"
import type { DraftSortSheetView } from "./hooks/use-draft-sort-sheet.ts"

const TITLE_ID = "draft-sort-sheet-title"

export function PresentationalDraftSortSheet(props: {
  readonly view: DraftSortSheetView
}): ReactElement {
  const { view } = props
  return (
    <aside
      id={TASK_SHEET_DOM_ID}
      aria-labelledby={TITLE_ID}
      tabIndex={-1}
      className={sheetStyles["task-sheet"]}
      onKeyDown={view.onKeyDown}
    >
      <DraftSortPanel panel={view.panel} titleId={TITLE_ID} onClose={view.onClose} />
      <DraftSortBand band={view.panel.band} />
      {view.confirm.kind === "open" && (
        <TaskRunConfirm target={view.confirm.target} onClose={view.onConfirmClose} />
      )}
    </aside>
  )
}
