// サイドシートの分類の場面のロジック。
// 選びと却下の理由はこの場面が開いているあいだだけ持ち、閉じると初めに戻る（保存しない）。
// ドラフトが1件も無くなったら閉じる。

import { useState, type KeyboardEvent } from "react"

import type { TaskSummaryResult } from "../../../../shared/repository/task-summary.ts"
import { useExternalSync } from "../../../hooks/use-external-sync.ts"
import { useTaskSheet } from "../../../stores/task-sheet.ts"
import {
  draftSortCardsOf,
  draftTasksOf,
  type DraftSortCard,
} from "../domain/draft-sort-sheet-content.ts"
import {
  chooseDraftSort,
  EMPTY_DRAFT_SORT,
  tallyDraftSort,
  type DraftSortChoice,
  type DraftSortState,
} from "../domain/draft-sort.ts"
import { SORT_OPEN_DOM_ID } from "../domain/task-row-dom-id.ts"
import type { TaskRunConfirmOutcome } from "../domain/task-run-confirm-outcome.ts"
import type { TaskRunTarget } from "../domain/task-run-prompt.ts"

type DraftSortConfirm =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly target: TaskRunTarget }

export type DraftSortSheetView = {
  readonly cards: readonly DraftSortCard[]
  /** 下端の口。計画か却下を1件以上選んだときだけ `some`。 */
  readonly band:
    | { readonly kind: "none"; readonly laterCount: number }
    | {
        readonly kind: "some"
        readonly planCount: number
        readonly dropCount: number
        readonly laterCount: number
        readonly onReset: () => void
        readonly onRequest: () => void
      }
  readonly confirm: DraftSortConfirm
  readonly onChoose: (id: string, choice: DraftSortChoice) => void
  readonly onReason: (id: string, reason: string) => void
  readonly onClose: () => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  readonly onConfirmClose: (outcome: TaskRunConfirmOutcome) => void
}

export function useDraftSortSheet(tasks: TaskSummaryResult): DraftSortSheetView {
  const close = useTaskSheet((state) => state.close)
  const [sort, setSort] = useState<DraftSortState>(EMPTY_DRAFT_SORT)
  const [confirm, setConfirm] = useState<DraftSortConfirm>({ kind: "closed" })

  const drafts = tasks.kind === "known" ? draftTasksOf(tasks.items) : []
  const empty = tasks.kind === "known" && drafts.length === 0
  useExternalSync(() => {
    if (empty) {
      close()
    }
  }, [empty, close])

  const tally = tallyDraftSort(
    drafts.map((task) => task.id),
    sort,
  )
  const closeToOpener = (): void => {
    globalThis.document.getElementById(SORT_OPEN_DOM_ID)?.focus()
    setConfirm({ kind: "closed" })
    close()
  }

  return {
    cards: draftSortCardsOf(drafts, sort),
    band:
      tally.planCount + tally.dropCount === 0
        ? { kind: "none", laterCount: tally.laterCount }
        : {
            kind: "some",
            planCount: tally.planCount,
            dropCount: tally.dropCount,
            laterCount: tally.laterCount,
            onReset: () => {
              setSort(EMPTY_DRAFT_SORT)
            },
            onRequest: () => {
              setConfirm({ kind: "open", target: { kind: "sort", request: tally.request } })
            },
          },
    confirm,
    onChoose: (id, choice) => {
      setSort((current) => chooseDraftSort(current, id, choice))
    },
    onReason: (id, reason) => {
      setSort((current) => ({ ...current, reasons: { ...current.reasons, [id]: reason } }))
    },
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
