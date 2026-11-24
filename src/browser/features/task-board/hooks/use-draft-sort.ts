// ドラフトの分類の場面の、札の選びと下端の口。
// 選びと却下の理由は保存しない。初めに戻すのは呼ぶ側が `reset` で決める。

import { useState } from "react"

import { FRAME_ERROR_REASON } from "../../../../shared/frame-error-reason.ts"
import type { TaskSummaryItem } from "../../../../shared/repository/task-summary.ts"
import { draftSortCardsOf } from "../domain/draft-sort-sheet-content.ts"
import {
  chooseDraftSort,
  EMPTY_DRAFT_SORT,
  tallyDraftSort,
  type DraftSortState,
} from "../domain/draft-sort.ts"
import type { DraftSortPanelView } from "../domain/task-board-view.ts"
import type { TaskRunTarget } from "../domain/task-run-prompt.ts"

/** `drafts` は一覧の順のドラフト。`onRequest` は下端の口で確かめる頼みを受ける。 */
export function useDraftSort(
  drafts: readonly TaskSummaryItem[],
  onRequest: (target: TaskRunTarget) => void,
  turnRunning: boolean,
): { readonly panel: DraftSortPanelView; readonly reset: () => void } {
  const [sort, setSort] = useState<DraftSortState>(EMPTY_DRAFT_SORT)
  const reset = (): void => {
    setSort(EMPTY_DRAFT_SORT)
  }
  const tally = tallyDraftSort(
    drafts.map((task) => task.id),
    sort,
  )
  return {
    panel: {
      cards: draftSortCardsOf(drafts, sort),
      band:
        tally.planCount + tally.dropCount === 0
          ? { kind: "none", laterCount: tally.laterCount }
          : {
              kind: "some",
              planCount: tally.planCount,
              dropCount: tally.dropCount,
              laterCount: tally.laterCount,
              ...(turnRunning ? { blockedReason: FRAME_ERROR_REASON.taskRequestDuringTurn } : {}),
              onReset: reset,
              onRequest: () => {
                onRequest({ kind: "sort", request: tally.request })
              },
            },
      onChoose: (id, choice) => {
        setSort((current) => chooseDraftSort(current, id, choice))
      },
      onReason: (id, reason) => {
        setSort((current) => ({ ...current, reasons: { ...current.reasons, [id]: reason } }))
      },
    },
    reset,
  }
}
