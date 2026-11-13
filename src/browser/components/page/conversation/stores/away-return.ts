// ページが隠れた時点と、戻ったときに離れていた時間。離れていたあいだのまとめの材料で、メモリだけに持ち保存しない。

import { create } from "zustand"

import { AWAY_MIN_MS, type SeenWorkPlans } from "../domain/away-brief.ts"

/**
 * 見えている（`present`）・隠れている（`hidden`。隠れた時刻 `at`）・{@link AWAY_MIN_MS} 以上離れて戻った（`returned`。離れていた時間 `awayMs`）。
 * `seen` は隠れた時点の今の依頼の `work-plan` の記録で、記録が無ければ持たない。
 */
export type AwayReturn =
  | { readonly kind: "present" }
  | { readonly kind: "hidden"; readonly at: number; readonly seen?: SeenWorkPlans }
  | { readonly kind: "returned"; readonly awayMs: number; readonly seen?: SeenWorkPlans }

type AwayReturnState = {
  readonly away: AwayReturn
  /** ページが隠れた。戻ったあとのまとめを出していても、新しく隠れた時点から数え直す。 */
  readonly hide: (at: number, seen?: SeenWorkPlans) => void
  /** ページが表に戻った。隠れていた時間が短ければ見えているに戻す。 */
  readonly show: (at: number) => void
  /** 戻ったあとの最初の操作で、まとめと印を畳む。 */
  readonly dismiss: () => void
}

const PRESENT = { kind: "present" } as const satisfies AwayReturn

export const useAwayReturn = create<AwayReturnState>()((set) => ({
  away: PRESENT,
  hide: (at, seen) => {
    set({ away: seen === undefined ? { kind: "hidden", at } : { kind: "hidden", at, seen } })
  },
  show: (at) => {
    set((state) => ({ away: returnedOf(state.away, at) }))
  },
  dismiss: () => {
    set({ away: PRESENT })
  },
}))

function returnedOf(away: AwayReturn, at: number): AwayReturn {
  if (away.kind !== "hidden") {
    return away
  }
  const awayMs = at - away.at
  if (awayMs < AWAY_MIN_MS) {
    return PRESENT
  }
  return away.seen === undefined
    ? { kind: "returned", awayMs }
    : { kind: "returned", awayMs, seen: away.seen }
}
