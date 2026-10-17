// やり取りごとの読み位置。ページを開いているあいだだけ覚える（メモリだけ。本文は持たない）。

import { create } from "zustand"

export type ReadingPosition = {
  /** 拾った見出しの並びでの番号。 */
  readonly headingIndex: number
  /** その見出しの上端 − 基準の線（px）。 */
  readonly offsetPx: number
}

export type ReadingPositionState = {
  /** 覚えがどの世代のセッションのものか。やり取りの ID はセッションごとに振るので、世代が変わったら捨てる。 */
  readonly generation: number
  /** やり取りの ID（`MainViewTurn.id`）から引く。 */
  readonly positions: Readonly<Record<number, ReadingPosition>>
  readonly remember: (turnId: number, position: ReadingPosition) => void
  readonly forget: (turnId: number) => void
  /** 覚えがこの世代のものでなければ全部忘れる。同じ世代なら何もしない（画面を隠して戻しても残す）。 */
  readonly forgetUnlessGeneration: (generation: number) => void
}

export const useReadingPosition = create<ReadingPositionState>()((set) => ({
  generation: -1,
  positions: {},
  remember: (turnId, position) => {
    set((state) => ({ positions: { ...state.positions, [turnId]: position } }))
  },
  forget: (turnId) => {
    set((state) => {
      const { [turnId]: _forgotten, ...rest } = state.positions
      return { positions: rest }
    })
  },
  forgetUnlessGeneration: (generation) => {
    set((state) => (state.generation === generation ? state : { generation, positions: {} }))
  },
}))
