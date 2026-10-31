// 根の下の塊を隠し、フレームごとに見せる範囲を進める本体。

import type { RevealTiming } from "../reveal-speed.ts"
import { brushStep } from "./band.ts"
import { brushScroller } from "./brush-scroll.ts"
import { BRUSH_ORIGIN_ATTRIBUTE, publishBrushTip, restBrushTip } from "./brush-tip.ts"
import { watchLayoutChange } from "./layout-change.ts"
import { endLineOf, layoutOf, type BlockLayout } from "./measure.ts"
import { applyStep, hideBlock, reachBlock, showBlock } from "./paint.ts"
import { blockProgress, isShortReport, planReveal, type RevealBlock } from "./plan.ts"

/** 見せる範囲を進めているあいだだけ根に立てる印（目視確認と、外から終わりを知るための口）。 */
const REVEALING_ATTRIBUTE = "data-revealing"

/**
 * 自動送りが追う範囲（`BrushTipRange.tipHeight`）に渡す、ミニ立ち絵の高さの見積もり。
 * 実測ではなく固定値で、`turn-card/mini-portrait.css` の `--mini-portrait-height`（`clamp(60px, 8vmin, 96px)`）の上限に合わせる。
 * 狭く見積もって立ち絵の頭が余白から出るより、広めに見積もって余白が少し余るほうが安全。
 */
const MINI_PORTRAIT_HEIGHT_ESTIMATE_PX = 96

/** 演出を飛ばす合図。本文に触りに来た操作だけを並べる（ホイール・指・`scroll` を入れない理由は `useReportReveal` の冒頭）。 */
const SKIP_EVENT_NAMES = ["pointerdown", "keydown"] as const

/** 合図は捕まえるだけで邪魔しない（`capture` は内側で止められても届かせるため）。 */
const SKIP_LISTENER_OPTIONS = { capture: true, passive: true } as const

/**
 * 根の下の塊を隠してから、フレームごとに見せる範囲を進める。`now` は経過時間の起点と各フレームの時刻を引く時計。
 * 戻り値を呼ぶとその場で全部出す（スキップと、部品が外れたときの後始末を兼ねる）。
 */
export function startReveal(
  root: HTMLElement,
  turnId: number,
  timing: RevealTiming,
  now: () => number,
): () => void {
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
  const startedAt = now()
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
    const elapsed = now() - startedAt
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
