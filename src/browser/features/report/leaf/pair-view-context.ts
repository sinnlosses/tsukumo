// 紙の見せ方（並べる・後だけ・前だけ）。`before-after` の対の全部が読む。紙の外では「並べる」で、切り替えの持ち主はいない。

import { createContext } from "react"

import type { PairView } from "../domain/pair-view.ts"

type PairViewContextValue = {
  readonly view: PairView
  readonly setView: (next: PairView) => void
  /** 切り替えを描く対の id。 */
  readonly ownerId?: string
  readonly labels: { readonly after: string; readonly before: string }
}

export const PairViewContext = createContext<PairViewContextValue>({
  view: "side",
  setView: () => undefined,
  labels: { after: "後だけ", before: "前だけ" },
})
