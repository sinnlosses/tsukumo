// 離れていたあいだの記録。ページが隠れた時点の最新のやり取りの流れの行の数と時刻を覚え、表に戻ったときに「離れていた」記録へ移す。
// タブのメモリだけに持つ（`localStorage` にもサーバにも書かない。開き直したあとは線を出さない）。
// 読み込み時に `visibilitychange` の購読を1回だけ始める。

import { create } from "zustand"

import { currentTurnSteps } from "../../../../../shared/session/turn-step.ts"
import { conversationStreamRowCountOf, mainViewTurnsOf } from "../../../../stores/main-view-turn.ts"
import { useSession } from "../../../../stores/session.ts"
import { nowEpochMilliseconds } from "../../../../utils/clock.ts"
import { awayLongEnough, type Away } from "../domain/away-seam.ts"
import { doneSegmentCountOf } from "../domain/work-segment.ts"

type Hidden = {
  readonly generation: number
  readonly turnId: number
  readonly rowCount: number
  readonly hiddenDoneSegments: number
  readonly hiddenAt: number
}

type AwaySeamState = {
  readonly hidden?: Hidden
  readonly away?: Away
}

type AwaySeamActions = {
  readonly markHidden: (hidden: Hidden) => void
  readonly markVisible: (now: number, visibleDoneSegments: number) => void
  /** 依頼か補足を送ったとき・別のやり取りを選んだときに、線を外す。 */
  readonly dismiss: () => void
}

export const useAwaySeam = create<AwaySeamState & AwaySeamActions>()((set) => ({
  markHidden: (hidden) => {
    set({ hidden, away: undefined })
  },
  markVisible: (now, visibleDoneSegments) => {
    set((state) => {
      const { hidden } = state
      if (hidden === undefined || !awayLongEnough(now - hidden.hiddenAt)) {
        return { hidden: undefined }
      }
      return {
        hidden: undefined,
        away: {
          generation: hidden.generation,
          turnId: hidden.turnId,
          rowCount: hidden.rowCount,
          hiddenDoneSegments: hidden.hiddenDoneSegments,
          visibleDoneSegments,
          awayMs: now - hidden.hiddenAt,
        },
      }
    })
  },
  dismiss: () => {
    set({ away: undefined })
  },
}))

function doneSegmentsNow(): number {
  const { state } = useSession.getState()
  const steps = currentTurnSteps(state.records, state.endedReason !== undefined)
  return steps.kind === "turn" ? doneSegmentCountOf(steps.plan) : 0
}

function hideNow(now: number): void {
  const { state, generation } = useSession.getState()
  const turnId = mainViewTurnsOf(state).at(-1)?.id
  if (turnId === undefined) {
    useAwaySeam.getState().dismiss()
    return
  }
  useAwaySeam.getState().markHidden({
    generation,
    turnId,
    rowCount: conversationStreamRowCountOf(state, turnId),
    hiddenDoneSegments: doneSegmentsNow(),
    hiddenAt: now,
  })
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hideNow(nowEpochMilliseconds())
    } else {
      useAwaySeam.getState().markVisible(nowEpochMilliseconds(), doneSegmentsNow())
    }
  })
}
