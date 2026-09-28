// 見ているターンが変わったら（自分で前後へ移った・新しいターンに連れていかれた・選んでいたターンが窓から外れた）、そのターンのレポートの先頭から読ませるフック。
//
// `scrollTop` ではなく `scrollIntoView` を使う。
// 実際に転がる祖先が画面幅で入れ替わる（広い画面は `section[data-region="main"]`、狭い画面（≤760px）はページ自身）。
// `scrollIntoView` は「どの祖先が転がっているか」を呼ぶ側が知らなくても、転がる祖先を全部たどって動かす。

import { useEffect, useRef, type RefObject } from "react"

/** ターンを載せる入れ物に付ける ref。`activeTurnId` が変わるたびに先頭へ戻す。 */
export function useActiveTurnScroll(
  activeTurnId: number | undefined,
): RefObject<HTMLDivElement | null> {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scroller = scrollerRef.current
    // 出ているターンが無い（`<MainView>` が placeholder を返す）ときは、戻す先そのものが無い。
    if (scroller === null || activeTurnId === undefined) {
      return
    }
    scroller.scrollIntoView({ block: "start" })
  }, [activeTurnId])

  return scrollerRef
}
