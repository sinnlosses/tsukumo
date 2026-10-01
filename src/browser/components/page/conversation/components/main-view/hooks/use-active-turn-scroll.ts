// 出している中身が変わったら（自分で前後へ移った・新しいターンに連れていかれた・地図とレポートを入れ替えた）、その先頭から読ませるフック。
//
// `scrollTop` ではなく `scrollIntoView` を使う。
// 実際に転がる祖先が画面幅で入れ替わる（広い画面は `section[data-region="main"]`、狭い画面（≤760px）はページ自身）。
// `scrollIntoView` は「どの祖先が転がっているか」を呼ぶ側が知らなくても、転がる祖先を全部たどって動かす。

import { useEffect, type RefObject } from "react"

/** `shownKey` が変わるたびに、`scrollerRef` の入れ物を先頭へ戻す。`none` のときは戻さない。 */
export function useActiveTurnScroll(
  scrollerRef: RefObject<HTMLElement | null>,
  shownKey: string,
): void {
  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller === null || shownKey === NO_SHOWN_KEY) {
      return
    }
    scroller.scrollIntoView({ block: "start" })
  }, [scrollerRef, shownKey])
}

/** 先頭へ戻す相手が無い（迎える口を出している）ときの鍵。 */
export const NO_SHOWN_KEY = "none"
