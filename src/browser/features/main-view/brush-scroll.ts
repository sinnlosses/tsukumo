// 書いている筆先が画面から出ないように、レポートを載せている器を送る
// （`docs/requirements.md` 4.3）。**送る相手を呼ぶ側に選ばせない**——根の要素を渡せば、
// 転がる祖先を自分で見つける。
//
// **どの祖先が転がっているかは画面幅で入れ替わる**（広い画面は `section[data-region="main"]`、
// 狭い画面（≤760px）はページ自身）。`main-view.tsx` がタブの切り替えで `scrollTop` ではなく
// `scrollIntoView` を使っているのと同じ事情で、ここも器を決め打ちにできない。
//
// **利用者のスクロールとは競合しない。** ホイール・指・ポインタ・キーはどれも演出そのものを
// 打ち切る合図（`report-reveal.ts`）なので、送っているあいだに利用者が転がすことはない。

import { type BrushTip } from "../../stores/brush-tip.ts"

/**
 * 筆先を器の上下の縁からこれだけ離して保つ。縁に貼り付くと、**次に書かれる行**が見えない
 * まま筆だけが進んでいるように見える。
 */
const KEEP_MARGIN_PX = 96

/**
 * 筆先を追いかける器を1つ決めて、**そこへ送る手**を返す。演出のあいだ毎フレーム呼ぶ。
 *
 * 器は演出を始めるときに1度だけ決める（`clip-path` も `opacity` もレイアウトを動かさないので、
 * 書いているあいだに転がる祖先が入れ替わることはない）。
 */
export function brushScroller(root: Element): (tip: BrushTip | undefined) => void {
  const scroller = scrollableAncestorOf(root)

  return (tip) => {
    if (tip === undefined) {
      return
    }

    const view = viewportOf(scroller)
    const below = tip.bottom - (view.bottom - KEEP_MARGIN_PX)
    const above = view.top + KEEP_MARGIN_PX - tip.top
    if (below > 0) {
      scroller.scrollTop += below
    } else if (above > 0) {
      scroller.scrollTop -= above
    }
  }
}

/**
 * 根から上へたどって、最初に見つけた「転がる器」。どれも転がらなければページ自身を返す
 * （狭い画面ではこちらが本命）。
 */
function scrollableAncestorOf(element: Element): Element {
  const parent = element.parentElement
  if (parent === null) {
    return document.scrollingElement ?? document.documentElement
  }
  return isScrollable(parent) ? parent : scrollableAncestorOf(parent)
}

function isScrollable(element: Element): boolean {
  const overflowY = window.getComputedStyle(element).overflowY
  return (
    (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight
  )
}

/**
 * 器の「見えている範囲」をビューポート座標で返す（筆先と同じ原点。`stores/brush-tip.ts`）。
 * **ページ自身が器のときは矩形を測らない**——`documentElement` の矩形は文書の高さであって、
 * 見えている範囲ではない。
 */
function viewportOf(scroller: Element): { readonly top: number; readonly bottom: number } {
  if (scroller === document.scrollingElement || scroller === document.documentElement) {
    return { top: 0, bottom: window.innerHeight }
  }

  const box = scroller.getBoundingClientRect()
  return { top: box.top, bottom: box.bottom }
}
