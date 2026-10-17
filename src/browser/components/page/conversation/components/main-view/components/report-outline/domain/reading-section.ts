// 読んでいる節の選び方。節は `##` で、`###` の途中にいても親の `##` を返す。

import type { ReadingSection } from "../../../../../../../../stores/reading-section.ts"

type Entry = { readonly level: "section" | "sub"; readonly text: string }

/**
 * `reached` は見出しを1つでも通り過ぎたか。
 * 通った見出しの手前に `##` が無いとき（先頭が `###` など）も `none`。
 */
export function readingSectionOf(
  entries: readonly Entry[],
  activeIndex: number,
  reached: boolean,
): ReadingSection {
  if (!reached) {
    return { kind: "none" }
  }
  const index = entries.findLastIndex((entry, at) => at <= activeIndex && entry.level === "section")
  const found = entries[index]
  return found === undefined ? { kind: "none" } : { kind: "shown", text: found.text }
}

/**
 * 読んでいる見出しの位置。`passedAtTop` は上端を通り過ぎた最後の見出し（無ければ -1）。
 * 転がし切ると最後の `##` が上端まで届かないので、転がし切ったときは最後の `##` までを読んだことにする（後戻りはしない）。
 */
export function readHeadingIndexOf(
  passedAtTop: number,
  levels: readonly ("section" | "sub")[],
  scrolledToEnd: boolean,
): number {
  if (!scrolledToEnd) {
    return passedAtTop
  }
  return Math.max(passedAtTop, levels.lastIndexOf("section"))
}

/** 転がる器が、転がせるのに端まで転がしきっているか（1px の誤差を許す）。 */
export function isScrolledToEnd(
  scroller: {
    readonly scrollTop: number
    readonly clientHeight: number
    readonly scrollHeight: number
  } | null,
): boolean {
  return (
    scroller !== null &&
    scroller.scrollHeight > scroller.clientHeight &&
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
  )
}
