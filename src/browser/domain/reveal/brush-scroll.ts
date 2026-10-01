// 書いている筆先が画面から出ないように、レポートを載せている器を送る。
// 送る相手を呼ぶ側に選ばせない（根の要素を渡せば、転がる祖先を自分で見つける）。
//
// 追う範囲は「いま書いている帯ぜんたい」ではなく「ミニ立ち絵の立つ位置」（帯の下端から、立ち絵の高さぶん上まで）。
// 行の多いトピックや表・図を含むトピックでは帯の背が器の見える高さに迫り、帯の上端・下端の両方を器の余白の内側に収めようとすると、はみ出した分を送ってはまた逆へ戻す往復が起きる。
// 立ち絵の立つ位置は帯の下端付近の狭い範囲なので、帯が背高でもこの往復は起きない。
//
// どの祖先が転がっているかは画面幅で入れ替わる（広い画面は `section[data-region="main"]`、狭い画面（≤760px）はページ自身）ので、器を決め打ちにできない。
//
// 比べるのは器の中身の座標（器の中身の上端が 0）。
// 筆先は基準の要素の座標で届くので、基準が器の中身のどこにあるかと器の見える高さを `remeasure` で測って覚え、毎フレーム読むのは `scrollTop` だけにする。
// どちらも器を送っても変わらないので、測り直すのは box が変わる出来事のときだけでよい。
//
// 利用者が手で転がしたら、そこで自動送りを降りる。
// ホイールと指は演出を打ち切らないので、送り続けると読もうとした位置から引き戻してしまう。
// 降りたらその演出のあいだは戻らない（読む位置を選んだのは利用者のほうなので、筆のほうが譲る）。

/** 筆先を器の上下の縁からこれだけ離して保つ。縁に貼り付くと、次に書かれる行が見えないまま筆だけが進んでいるように見える。 */
const KEEP_MARGIN_PX = 96

/**
 * ミニ立ち絵が立つ位置の縦の範囲。`brushScroller` に渡した基準の要素の左上が原点。
 *
 * `tipBottom` は帯の下端（ミニ立ち絵の足元）、`tipHeight` はそこから立ち絵の高さぶん上までの見積もりで、呼ぶ側が固定値で渡す。
 * 実際の高さは窓幅で 60〜96px に変わるが（`mini-portrait.module.css` の `--mini-portrait-height`）、ここで DOM を測ると、立ち絵が出ない状況（素材が無い・印が見つからない）の分岐まで持ち込むことになる。
 */
export type BrushTipRange = {
  readonly tipBottom: number
  readonly tipHeight: number
}

/** 筆先を追う器と、その見張り。 */
export type BrushScroller = {
  /** 送る器。寸法が変わったら `remeasure` が要る。 */
  readonly element: Element
  /** 基準の位置と器の見える高さを測り直す。`follow` より先に1回は呼ぶ（呼ぶまでは送らない）。 */
  readonly remeasure: () => void
  /** 筆先を器の中に保つ。演出のあいだ毎フレーム呼ぶ。 */
  readonly follow: (tip: BrushTipRange | undefined) => void
  /** 見張りを外す。演出が終わったら必ず呼ぶ（呼ばないと合図の口が残る）。 */
  readonly stop: () => void
}

/** 手で転がした合図。打ち切りの合図とは別（こちらは自動送りを降ろすだけ）。 */
const HAND_SCROLL_EVENT_NAMES = ["wheel", "touchmove"] as const

/** 合図は捕まえるだけで邪魔しない。 */
const HAND_SCROLL_LISTENER_OPTIONS = { capture: true, passive: true } as const

/**
 * 筆先を追いかける器を1つ決めて、そこへ送る手を返す。`base` は筆先の座標の原点になる要素。
 *
 * 器は演出を始めるときに1度だけ決める（`clip-path` も `opacity` もレイアウトを動かさないので、書いているあいだに転がる祖先が入れ替わることはない）。
 */
export function brushScroller(root: Element, base: Element): BrushScroller {
  const scroller = scrollableAncestorOf(root)
  let byHand = false
  let place: ScrollerPlace | undefined = undefined
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

  const remeasure = (): void => {
    const view = viewportOf(scroller)
    place = {
      baseTop: base.getBoundingClientRect().top - view.top + scroller.scrollTop,
      viewHeight: view.bottom - view.top,
    }
  }

  const follow = (tip: BrushTipRange | undefined): void => {
    if (tip === undefined || byHand || place === undefined) {
      return
    }

    const visibleTop = scroller.scrollTop
    const tipBottom = place.baseTop + tip.tipBottom
    const below = tipBottom - (visibleTop + place.viewHeight - KEEP_MARGIN_PX)
    if (below > 0) {
      scroller.scrollTop += below
      return
    }

    // 立ち絵の高さぶんの範囲と上下の余白の両方を器へ収めるには、器の見える高さが `tipHeight + KEEP_MARGIN_PX×2` 要る。
    // それより器が低いときは下端（いま書いている足元）を優先し、上端の余白は諦める。
    // ここで諦めずに上端も送ると、次のフレームで下端がまた縁の外へ出て送り直しになり、往復が戻ってくる。
    if (place.viewHeight < tip.tipHeight + KEEP_MARGIN_PX * 2) {
      return
    }

    const above = visibleTop + KEEP_MARGIN_PX - (tipBottom - tip.tipHeight)
    if (above > 0) {
      scroller.scrollTop -= above
    }
  }

  return { element: scroller, remeasure, follow, stop }
}

/** 器の中身の座標での基準の上端と、器の見える高さ。 */
type ScrollerPlace = {
  readonly baseTop: number
  readonly viewHeight: number
}

/** 根から上へたどって、最初に見つけた「転がる器」。どれも転がらなければページ自身を返す（狭い画面ではこちらが本命）。 */
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
 * 器の「見えている範囲」をビューポート座標で返す。
 * ページ自身が器のときは矩形を測らない（`documentElement` の矩形は文書の高さであって、見えている範囲ではない）。
 */
function viewportOf(scroller: Element): { readonly top: number; readonly bottom: number } {
  if (scroller === document.scrollingElement || scroller === document.documentElement) {
    return { top: 0, bottom: window.innerHeight }
  }

  const box = scroller.getBoundingClientRect()
  return { top: box.top, bottom: box.bottom }
}
