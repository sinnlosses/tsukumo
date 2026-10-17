// やり取りごとの読み位置。ページを開いているあいだだけ覚える（メモリだけ。本文は持たない）。

import { create } from "zustand"

export type ReadingPosition = {
  /** 拾った見出しの並びでの番号。 */
  readonly headingIndex: number
  /** その見出しの上端 − 基準の線（px）。 */
  readonly offsetPx: number
}

export type ReadingPositionState = {
  /** やり取りの ID（`MainViewTurn.id`）から引く。 */
  readonly positions: Readonly<Record<number, ReadingPosition>>
  readonly remember: (turnId: number, position: ReadingPosition) => void
  readonly forget: (turnId: number) => void
  /** 全部忘れる。やり取りの ID はセッションごとに振るので、セッションが替わったら呼ぶ。 */
  readonly clear: () => void
}

export const useReadingPosition = create<ReadingPositionState>()((set) => ({
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
  clear: () => {
    set({ positions: {} })
  },
}))
