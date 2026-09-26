// 見ているターンが変わったら（自分で前後へ移った・新しいターンに連れていかれた・選んでいた
// ターンが窓から外れた）、そのターンのレポートの先頭から読ませる1つだけの仕事を持つフック
// （docs/design.md 2章「機能の中を分ける」。外の世界に触るフックだけを `main-view.tsx` から
// 出した）。
//
// `scrollTop` ではなく `scrollIntoView`: 実際に転がる祖先が画面幅で入れ替わる
// （広い画面は `section[data-region="main"]`、狭い画面（≤760px）はページ自身）。
// `scrollIntoView` は「どの祖先が転がっているか」を呼ぶ側が知らなくても、転がる祖先を
// 全部たどって動かす。
//
// React の外＝スクロール位置への書き込みなので `useEffect` で同期する
// （`docs/coding-standards.md`「React」の4類型の2つ目）。

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
