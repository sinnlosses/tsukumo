// サイドシートの分類の場面のロジック。
// 選びと却下の理由はこの場面が開いているあいだだけ持ち、閉じると初めに戻る（保存しない）。
// ドラフトが1件も無くなったら閉じる。

import { useState, type KeyboardEvent } from "react"

import type { TaskSummaryResult } from "../../../../shared/repository/task-summary.ts"
import { useExternalSync } from "../../../hooks/use-external-sync.ts"
import { useTaskSheet } from "../../../stores/task-sheet.ts"
import { draftTasksOf } from "../domain/draft-sort-sheet-content.ts"
import type { DraftSortPanelView } from "../domain/task-board-view.ts"
import { SORT_OPEN_DOM_ID } from "../domain/task-row-dom-id.ts"
import type { TaskRunConfirmOutcome } from "../domain/task-run-confirm-outcome.ts"
import type { TaskRunTarget } from "../domain/task-run-prompt.ts"
import { useDraftSort } from "./use-draft-sort.ts"

type DraftSortConfirm =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly target: TaskRunTarget }

export type DraftSortSheetView = {
  readonly panel: DraftSortPanelView
  readonly confirm: DraftSortConfirm
  readonly onClose: () => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  readonly onConfirmClose: (outcome: TaskRunConfirmOutcome) => void
}

export function useDraftSortSheet(tasks: TaskSummaryResult): DraftSortSheetView {
  const close = useTaskSheet((state) => state.close)
  const [confirm, setConfirm] = useState<DraftSortConfirm>({ kind: "closed" })

  const drafts = tasks.kind === "known" ? draftTasksOf(tasks.items) : []
  const empty = tasks.kind === "known" && drafts.length === 0
  useExternalSync(() => {
    if (empty) {
      close()
    }
  }, [empty, close])

  const { panel } = useDraftSort(drafts, (target) => {
    setConfirm({ kind: "open", target })
  })
  const closeToOpener = (): void => {
    globalThis.document.getElementById(SORT_OPEN_DOM_ID)?.focus()
    setConfirm({ kind: "closed" })
    close()
  }

  return {
    panel,
    confirm,
    onClose: closeToOpener,
    onKeyDown: (event) => {
      if (
        confirm.kind === "open" ||
        event.nativeEvent.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        closeToOpener()
      }
    },
    onConfirmClose: (outcome) => {
      setConfirm({ kind: "closed" })
      if (outcome === "sent") {
        closeToOpener()
      }
    },
  }
}
