// 書いている筆先が画面から出ないように、レポートを載せている器を送る
// （`docs/requirements.md` 4.3）。**送る相手を呼ぶ側に選ばせない**——根の要素を渡せば、
// 転がる祖先を自分で見つける。
//
// **どの祖先が転がっているかは画面幅で入れ替わる**（広い画面は `section[data-region="main"]`、
// 狭い画面（≤760px）はページ自身）。`main-view.tsx` がタブの切り替えで `scrollTop` ではなく
// `scrollIntoView` を使っているのと同じ事情で、ここも器を決め打ちにできない。
//
// **利用者が手で転がしたら、そこで自動送りを降りる。** ホイールと指は演出を打ち切らない
// （`report-reveal.ts`）ので、送り続けると読もうとした位置から引き戻してしまう。降りたら
// その演出のあいだは戻らない——読む位置を選んだのは利用者のほうなので、筆のほうが譲る。

import { type BrushTip } from "../../stores/brush-tip.ts"

/**
 * 筆先を器の上下の縁からこれだけ離して保つ。縁に貼り付くと、**次に書かれる行**が見えない
 * まま筆だけが進んでいるように見える。
 */
const KEEP_MARGIN_PX = 96

/** 筆先を追う器と、その見張り。 */
export type BrushScroller = {
  /** 筆先を器の中に保つ。演出のあいだ毎フレーム呼ぶ。 */
  readonly follow: (tip: BrushTip | undefined) => void
  /** 見張りを外す。**演出が終わったら必ず呼ぶ**（呼ばないと合図の口が残る）。 */
  readonly stop: () => void
}

/** 手で転がした合図。**打ち切りの合図とは別**（こちらは自動送りを降ろすだけ）。 */
const HAND_SCROLL_EVENT_NAMES = ["wheel", "touchmove"] as const

/** 合図は捕まえるだけで邪魔しない。 */
const HAND_SCROLL_LISTENER_OPTIONS = { capture: true, passive: true } as const

/**
 * 筆先を追いかける器を1つ決めて、**そこへ送る手**を返す。演出のあいだ毎フレーム呼ぶ。
 *
 * 器は演出を始めるときに1度だけ決める（`clip-path` も `opacity` もレイアウトを動かさないので、
 * 書いているあいだに転がる祖先が入れ替わることはない）。
 */
export function brushScroller(root: Element): BrushScroller {
  const scroller = scrollableAncestorOf(root)
  let byHand = false
  const release = (): void => {
    byHand = true
  }
  for (const name of HAND_SCROLL_EVENT_NAMES) {
    window.addEventListener(name, release, HAND_SCROLL_LISTENER_OPTIONS)
  }

  const stop = (): void => {
    for (const name of HAND_SCROLL_EVENT_NAMES) {
      window.removeEventListener(name, release, HAND_SCROLL_LISTENER_OPTIONS)
    }
  }

  const follow = (tip: BrushTip | undefined): void => {
    if (tip === undefined || byHand) {
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

  return { follow, stop }
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
