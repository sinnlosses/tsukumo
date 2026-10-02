// 確定したレポートを「書き上げていくように見せる」演出の入口。
// DOM は完成品を一度に作り、見せる範囲だけを進める。
// 文字を足していく実装にすると、表・mermaid・Chart.js が未完成のソースで作り直され、非同期に描く mermaid は途中の形で失敗する。
//
// 筆はトピック1つをZ字で書く。
// その中の行を上下2つの帯に割り、帯ごとに左から右へなぞって、あいだを斜めに戻る（Z字の3画）。
// 帯の切れ目は実際の行の box に合わせるので、文字が上下に切れることはない（1行しかない塊は1画で書く）。
//
// ここはフレームを回すだけ。
//
// 座標はすべて本文の入れ物（`data-brush-origin`。無ければ根）の左上を原点にする。
// 書き上げたあとも筆先はその場に残るので、ビューポート基準のままだと転がすたびに関係ない場所へずれる。
// 器を送っても動かない原点なので、塊の box は書き始めるときに1回測って持ち回り、測り直すのは box が変わる出来事（`watchLayoutChange`）のあとだけにする。
//
// 打ち切る口は2つ（クリック・キー入力）。ホイールと指では打ち切らない。
// 先を読もうとして転がすのは「もう要らない」ではなく「見ていたい」の側なので、打ち切ると筆を追うたびに筆が消える。
// 代わりに、手で転がしたら筆先を追う自動送りだけを降ろす。
// `scroll` そのものは聞かない（スクロールアンカリングや `scrollIntoView` でも飛んでくるので、利用者の操作そのものだけを合図にする）。
//
// 筆で書くのは節（`.report-sections-start` より後ろ）だけで、結論と検証結果は最初から出す。節が短いレポートは演出しない。
//
// `prefers-reduced-motion: reduce` では演出ごと無効（`theme.css` の規則は CSS のアニメーションにしか効かないので、ここでも見る）。

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

import { loadRevealSpeed, revealTimingOf, type RevealTiming } from "../reveal-speed.ts"
import { brushStep } from "./band.ts"
import { brushScroller } from "./brush-scroll.ts"
import { BRUSH_ORIGIN_ATTRIBUTE, publishBrushTip, restBrushTip } from "./brush-tip.ts"
import { watchLayoutChange } from "./layout-change.ts"
import { endLineOf, layoutOf, type BlockLayout } from "./measure.ts"
import { applyStep, hideBlock, reachBlock, showBlock } from "./paint.ts"
import { blockProgress, isShortReport, planReveal, type RevealBlock } from "./plan.ts"
import { prefersReducedMotion } from "./reduced-motion.ts"

/** 見せる範囲を進めているあいだだけ根に立てる印（目視確認と、外から終わりを知るための口）。 */
const REVEALING_ATTRIBUTE = "data-revealing"

/**
 * 自動送りが追う範囲（`BrushTipRange.tipHeight`）に渡す、ミニ立ち絵の高さの見積もり。
 * 実測ではなく固定値で、`mini-portrait.module.css` の `--mini-portrait-height`（`clamp(60px, 8vmin, 96px)`）の上限に合わせる。
 * 狭く見積もって立ち絵の頭が余白から出るより、広めに見積もって余白が少し余るほうが安全。
 */
const MINI_PORTRAIT_HEIGHT_ESTIMATE_PX = 96

/** 演出を飛ばす合図。本文に触りに来た操作だけを並べる（ホイール・指・`scroll` を入れない理由は冒頭）。 */
const SKIP_EVENT_NAMES = ["pointerdown", "keydown"] as const

/** 合図は捕まえるだけで邪魔しない（`capture` は内側で止められても届かせるため）。 */
const SKIP_LISTENER_OPTIONS = { capture: true, passive: true } as const

/**
 * レポートの根に付ける ref を返す。`reveal` が立っていたら、マウントした直後から見せる範囲を進める。
 * `turnId` はこの本文が載っているやり取りで、配る筆先に添えて持たせる。
 *
 * 見るのはマウントした時点の `reveal` だけ。
 * あとから対象でなくなっても（後ろに別のレポートが現れても）始めた演出は最後まで進める（途中で止めると書きかけの本文が残る）。
 * 「書き上げる演出の速さ」もマウント時の値だけを見る（速さを変えても、書いている最中の演出は前の速さのまま進み切る）。
 */
export function useReportReveal(reveal: boolean, turnId: number): RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement>(null)
  const [revealOnMount] = useState(reveal)
  const [revealSpeed] = useState(loadRevealSpeed)
  // 同じ本文を二度書かない。
  // `<Activity mode="hidden">` は部品の状態を残したまま効果だけを外すので、戻ってきたときにこの効果がもう一度走る。
  const revealedOnce = useRef(false)

  // `useLayoutEffect` でなければならない。`useEffect` は描画のあとに走るので、隠す前の本文が1フレームだけ全部見えてしまう。
  // 依存はどちらもマウント時に決まったきり変わらない（`<Turn>` はやり取りの番号を `key` に持つので、`turnId` が変わるときは部品ごと作り直される）。
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!revealOnMount || revealedOnce.current || root === null || prefersReducedMotion()) {
      return undefined
    }
    // 「切る」は物差しを持たない。`startReveal` を呼ばずに済ませると本文はすぐ全部出た状態のままで、ミニ立ち絵の筆も出ない。
    if (revealSpeed === "off") {
      return undefined
    }
    revealedOnce.current = true
    return startReveal(root, turnId, revealTimingOf(revealSpeed))
  }, [revealOnMount, turnId, revealSpeed])

  return rootRef
}

/**
 * 根の下の塊を隠してから、フレームごとに見せる範囲を進める。
 * 戻り値を呼ぶとその場で全部出す（スキップと、部品が外れたときの後始末を兼ねる）。
 */
function startReveal(root: HTMLElement, turnId: number, timing: RevealTiming): () => void {
  const blocks = isShortReport(root) ? [] : planReveal(root, timing)
  if (blocks.length === 0) {
    return () => undefined
  }

  for (const block of blocks) {
    hideBlock(block)
  }
  root.setAttribute(REVEALING_ATTRIBUTE, "yes")

  // 筆先の座標の原点。印が見つからなければ筆先を配らない（ミニ立ち絵は出ないが、本文を書き上げる演出そのものは進む）。
  const origin = root.closest(`[${BRUSH_ORIGIN_ATTRIBUTE}]`)
  const base = origin ?? root
  const scroller = brushScroller(root, base)
  // 書き終わりに筆先を残す先（`finish()`）。塊は時間の順に並んでいるので、末尾が最後に書く塊。
  const lastBlock = blocks.at(-1)
  const startedAt = performance.now()
  let frame = 0
  let shown = 0
  let finished = false
  // 測れなかった塊（まだレイアウトされていない）もそのまま持ち回る。寸法が付けば見張りが知らせる。
  let measured: { readonly index: number; readonly layout: BlockLayout | undefined } | undefined =
    undefined
  let stale = false
  const layoutWatch = watchLayoutChange(
    layoutWatchTargets(blocks, root, base, scroller.element),
    () => {
      stale = true
    },
  )

  const finish = (): void => {
    if (finished) {
      return
    }
    finished = true
    cancelAnimationFrame(frame)
    // 残すのは「本文の末尾」で、打ち切られたときに筆が止まっていた場所ではない。
    // `finish()` は残りを全部出すので、途中で止まった場所に残すと「まだ書いている途中」に見える。
    const end = lastBlock === undefined ? undefined : endLineOf(lastBlock, base)
    for (const block of blocks) {
      showBlock(block)
    }
    root.removeAttribute(REVEALING_ATTRIBUTE)
    // 書き終わっても筆先は消さない（飛ばされたときも同じ）。次に書き始めたときだけ移る。
    // 末尾が測れなかったときは、最後に配った位置のまま残す。
    if (origin !== null && end !== undefined) {
      publishBrushTip({ x: end.right, top: end.top, bottom: end.bottom, turnId, phase: "resting" })
    } else {
      restBrushTip()
    }
    layoutWatch.stop()
    scroller.stop()
    for (const name of SKIP_EVENT_NAMES) {
      window.removeEventListener(name, finish, SKIP_LISTENER_OPTIONS)
    }
  }

  const tick = (): void => {
    // 出し切ったあとに積み残しのフレームが走っても、隠し直さない。
    if (finished) {
      return
    }
    const elapsed = performance.now() - startedAt
    // 通り過ぎた塊は出し切る。塊は時間の順に並んでいるので、先頭から数えるだけでよい。
    for (let block = blocks.at(shown); block !== undefined && block.endMs <= elapsed;) {
      showBlock(block)
      shown += 1
      block = blocks.at(shown)
    }

    const current = blocks.at(shown)
    if (current === undefined) {
      finish()
      return
    }
    if (measured === undefined || measured.index !== shown || stale) {
      reachBlock(current)
      measured = { index: shown, layout: layoutOf(current, base) }
      scroller.remeasure()
      stale = false
      layoutWatch.watch(measured.layout?.drawn ?? [])
    }
    const layout = measured.layout
    // まだレイアウトされていない塊は隠したまま、寸法が付いたところで追いつく。
    const step =
      layout === undefined ? undefined : brushStep(layout.bands, blockProgress(current, elapsed))
    // 読む（`scrollTop`）のを書く（`clip-path`・`opacity`）より先にする。逆だと書いたばかりの style をその場で計算させる。
    scroller.follow(
      step === undefined
        ? undefined
        : { tipBottom: step.tipBottom, tipHeight: MINI_PORTRAIT_HEIGHT_ESTIMATE_PX },
    )
    if (layout !== undefined && step !== undefined) {
      for (const shape of layout.shapes) {
        applyStep(shape, step)
      }
    }
    if (origin !== null) {
      publishBrushTip(
        step === undefined
          ? undefined
          : {
              x: step.tipX,
              top: step.tipTop,
              bottom: step.tipBottom,
              turnId,
              phase: "writing",
              stroke: step.stroke,
            },
      )
    }
    frame = requestAnimationFrame(tick)
  }

  frame = requestAnimationFrame(tick)
  for (const name of SKIP_EVENT_NAMES) {
    window.addEventListener(name, finish, SKIP_LISTENER_OPTIONS)
  }

  return finish
}

/**
 * 測った box が古くなったと知るために見張る要素。
 *
 * - 塊の要素: 画像や図が読み込まれて寸法が変わる・外されて寸法が 0 になる
 * - 根から原点までの祖先: 本文より上にあるものが伸びると、本文は寸法を変えずに位置だけずれるが、そのとき祖先のどれかの寸法が変わる
 * - 器: 領域の高さだけが変わったとき、本文の寸法にも原点の寸法にも出ない
 */
function layoutWatchTargets(
  blocks: readonly RevealBlock[],
  root: Element,
  base: Element,
  scroller: Element,
): readonly Element[] {
  return [
    ...blocks.flatMap((block) => block.members.map((member) => member.element)),
    ...ancestorsUpTo(root, base),
    scroller,
  ]
}

/** `element` から `base` までの祖先（両端を含む）。`base` が祖先に無ければ `element` から根まで。 */
function ancestorsUpTo(element: Element, base: Element): readonly Element[] {
  const parent = element.parentElement
  if (element === base || parent === null) {
    return [element]
  }
  return [element, ...ancestorsUpTo(parent, base)]
}
