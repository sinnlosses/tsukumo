// やり取りごとの「働いているあいだに中間レポートを見たか」と、「新」の印を押して消した節。ページを開いているあいだだけ覚える（メモリだけ。本文は持たない）。

import { create } from "zustand"

type InterimViewingState = {
  /** 覚えがどの世代のセッションのものか。やり取りの ID はセッションごとに振るので、世代が変わったら捨てる。 */
  readonly generation: number
  /** やり取りの ID（`MainViewTurn.id`）から引く。中間レポートを見たやり取り。 */
  readonly viewed: Readonly<Record<number, true>>
  /** 押して読んだ（「新」を消した）節の欄の ID（`MainViewReportSection.id`）。 */
  readonly read: Readonly<Record<number, readonly number[]>>
  readonly markViewed: (turnId: number) => void
  readonly markRead: (turnId: number, sectionId: number) => void
  /** 覚えがこの世代のものでなければ全部忘れる。同じ世代なら何もしない（画面を隠して戻しても残す）。 */
  readonly forgetUnlessGeneration: (generation: number) => void
}

export const useInterimViewing = create<InterimViewingState>()((set) => ({
  generation: -1,
  viewed: {},
  read: {},
  markViewed: (turnId) => {
    set((state) => (state.viewed[turnId] ? state : { viewed: { ...state.viewed, [turnId]: true } }))
  },
  markRead: (turnId, sectionId) => {
    set((state) => {
      const already = state.read[turnId] ?? []
      return already.includes(sectionId)
        ? state
        : { read: { ...state.read, [turnId]: [...already, sectionId] } }
    })
  },
  forgetUnlessGeneration: (generation) => {
    set((state) => (state.generation === generation ? state : { generation, viewed: {}, read: {} }))
  },
}))
