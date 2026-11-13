// 新しい器の紙の読む深さと、節ごとの畳みを持つ store。部屋（このタブ）に1つで、保存しない（開き直したら本文に戻る）。

import { create } from "zustand"

/** 1 は一目、2 は本文、3 は記録。 */
export type ReadingDepth = 1 | 2 | 3

/** `section` は節1つ、`all` は渡した節の全部。全部が畳まれていれば全部を開き、そうでなければ全部を畳む。 */
export type FoldTarget =
  | { readonly kind: "section"; readonly key: string }
  | { readonly kind: "all"; readonly keys: readonly string[] }

type ReadingDepthState = {
  readonly depth: ReadingDepth
  readonly foldedSections: ReadonlySet<string>
  readonly setDepth: (depth: ReadingDepth) => void
  readonly toggleFold: (target: FoldTarget) => void
}

export const READING_DEPTHS = [
  { depth: 1, label: "一目" },
  { depth: 2, label: "本文" },
  { depth: 3, label: "記録" },
] as const satisfies readonly { readonly depth: ReadingDepth; readonly label: string }[]

export const useReadingDepth = create<ReadingDepthState>()((set) => ({
  depth: 2,
  foldedSections: new Set(),
  setDepth: (depth) => {
    set((state) => (state.depth === depth ? state : { depth }))
  },
  toggleFold: (target) => {
    set((state) => ({ foldedSections: toggledSections(state.foldedSections, target) }))
  },
}))

/** `d` のキーで回す先。1 → 2 → 3 → 1。 */
export function nextReadingDepth(depth: ReadingDepth): ReadingDepth {
  return depth === 3 ? 1 : depth === 1 ? 2 : 3
}

function toggledSections(folded: ReadonlySet<string>, target: FoldTarget): ReadonlySet<string> {
  if (target.kind === "section") {
    return folded.has(target.key)
      ? new Set([...folded].filter((key) => key !== target.key))
      : new Set([...folded, target.key])
  }
  const allFolded = target.keys.length > 0 && target.keys.every((key) => folded.has(key))
  return allFolded
    ? new Set([...folded].filter((key) => !target.keys.includes(key)))
    : new Set([...folded, ...target.keys])
}
