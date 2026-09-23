// 書いている筆先が画面から出ないように、レポートを載せている器を送る
// （`docs/requirements.md` 4.3）。**送る相手を呼ぶ側に選ばせない**——根の要素を渡せば、
// 転がる祖先を自分で見つける。
//
// **追う範囲は「いま書いている帯ぜんたい」ではなく「ミニ立ち絵の立つ位置」**（帯の下端から、
// 立ち絵の高さぶん上まで。`mini-portrait.tsx` の `followStyle` と同じ場所）。行の多いトピックや
// 表・図を含むトピックでは帯の背が器の見える高さに迫り、帯の上端・下端の両方を器の余白の内側に
// 収めようとすると、はみ出した分を送ってはまた逆へ戻す往復が起きる
// （`hooks/use-report-reveal.ts` 冒頭）。立ち絵の立つ位置は帯の下端付近の狭い範囲なので、
// 帯が背高でもこの往復は起きない。
//
// **どの祖先が転がっているかは画面幅で入れ替わる**（広い画面は `section[data-region="main"]`、
// 狭い画面（≤760px）はページ自身）。`main-view.tsx` がターンの切り替えで `scrollTop` ではなく
// `scrollIntoView` を使っているのと同じ事情で、ここも器を決め打ちにできない。
//
// **利用者が手で転がしたら、そこで自動送りを降りる。** ホイールと指は演出を打ち切らない
// （`hooks/use-report-reveal.ts`）ので、送り続けると読もうとした位置から引き戻してしまう。降りたら
// その演出のあいだは戻らない——読む位置を選んだのは利用者のほうなので、筆のほうが譲る。

/**
 * 筆先を器の上下の縁からこれだけ離して保つ。縁に貼り付くと、**次に書かれる行**が見えない
 * まま筆だけが進んでいるように見える。
 */
const KEEP_MARGIN_PX = 96

/**
 * ミニ立ち絵が立つ位置の縦の範囲。**ビューポート座標**（`reveal-measure.ts` が測った生の値で、
 * 配る筆先のように本文の入れ物へ写す前のもの）——器の見えている範囲と引き算するので、
 * ここだけは原点を移さない。
 *
 * `tipBottom` は帯の下端（ミニ立ち絵の足元。`mini-portrait.tsx` の `followStyle` と同じ）、
 * `tipHeight` はそこから立ち絵の高さぶん上までの見積もり。**呼ぶ側が固定値で渡す**
 * （`hooks/use-report-reveal.ts`）——実際の高さは窓幅で 60〜96px に変わるが
 * （`mini-portrait.module.css` の `--mini-portrait-height`）、ここで DOM を測ると、立ち絵が出ない状況（素材が無い・印が
 * 見つからない）の分岐まで持ち込むことになる。帯ぜんたい（行の多いトピックでは器の見える
 * 高さに迫る）ではなくこの狭い範囲だけを追うので、フレームごとに送っては戻す往復が起きない。
 */
export type BrushTipRange = {
  readonly tipBottom: number
  readonly tipHeight: number
}

/** 筆先を追う器と、その見張り。 */
export type BrushScroller = {
  /** 筆先を器の中に保つ。演出のあいだ毎フレーム呼ぶ。 */
  readonly follow: (tip: BrushTipRange | undefined) => void
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

  const follow = (tip: BrushTipRange | undefined): void => {
    if (tip === undefined || byHand) {
      return
    }

    const view = viewportOf(scroller)
    const below = tip.tipBottom - (view.bottom - KEEP_MARGIN_PX)
    if (below > 0) {
      scroller.scrollTop += below
      return
    }

    // 立ち絵の高さぶんの範囲と上下の余白の両方を器へ収めるには、器の見える高さが
    // `tipHeight + KEEP_MARGIN_PX×2` 要る。それより器が低いときは**下端（いま書いている足元）を
    // 優先し、上端の余白は諦める**——書いている場所が見えることのほうが、範囲の天井が余白に
    // 触れているかより大事。ここで諦めずに上端も送ると、次のフレームで下端がまた縁の外へ出て
    // 送り直しになり、往復が戻ってくる。
    if (view.bottom - view.top < tip.tipHeight + KEEP_MARGIN_PX * 2) {
      return
    }

    const above = view.top + KEEP_MARGIN_PX - (tip.tipBottom - tip.tipHeight)
    if (above > 0) {
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
 * 器の「見えている範囲」をビューポート座標で返す（測ったままの筆先と同じ原点）。
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
