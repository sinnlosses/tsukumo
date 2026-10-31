// やり取りごとの読み位置。ページを開いているあいだだけ覚える（メモリだけ。本文は持たない）。
// やり取りの ID はセッションごとに振るので、覚えはセッションの世代（`session.generation`）つきで持つ。
// 世代が違う覚えは読まれず、書くときに捨てられる（画面を隠して戻しても世代が同じなら残る）。

import { create } from "zustand"

export type ReadingPosition = {
  /** 拾った見出しの並びでの番号。 */
  readonly headingIndex: number
  /** その見出しの上端 − 基準の線（px）。 */
  readonly offsetPx: number
}

type ReadingPositionState = {
  /** `positions` がどの世代のものか。 */
  readonly generation: number
  /** やり取りの ID（`MainViewTurn.id`）から引く。 */
  readonly positions: Readonly<Record<number, ReadingPosition>>
  readonly remember: (generation: number, turnId: number, position: ReadingPosition) => void
  readonly forget: (generation: number, turnId: number) => void
}

export const useReadingPosition = create<ReadingPositionState>()((set) => ({
  generation: -1,
  positions: {},
  remember: (generation, turnId, position) => {
    set((state) => ({
      generation,
      positions: { ...positionsOf(state, generation), [turnId]: position },
    }))
  },
  forget: (generation, turnId) => {
    set((state) => {
      const { [turnId]: _forgotten, ...rest } = positionsOf(state, generation)
      return { generation, positions: rest }
    })
  },
}))

/** その世代で覚えたやり取りの読み位置。世代が違えば `undefined`。 */
export function rememberedPosition(
  state: Pick<ReadingPositionState, "generation" | "positions">,
  generation: number,
  turnId: number,
): ReadingPosition | undefined {
  return positionsOf(state, generation)[turnId]
}

function positionsOf(
  state: Pick<ReadingPositionState, "generation" | "positions">,
  generation: number,
): Readonly<Record<number, ReadingPosition>> {
  return state.generation === generation ? state.positions : {}
}
