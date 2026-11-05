// 読んでいる見出しの位置の決め方。

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
  scroller:
    | {
        readonly scrollTop: number
        readonly clientHeight: number
        readonly scrollHeight: number
      }
    | undefined,
): boolean {
  return (
    scroller !== undefined &&
    scroller.scrollHeight > scroller.clientHeight &&
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
  )
}
