// 確定したレポートを「書き上げていくように見せる」演出（`docs/requirements.md` 4.3）の入口。
// DOM は完成品を一度に作り、見せる範囲だけを進める——文字を足していく実装にすると、表・
// mermaid・Chart.js が未完成のソースで作り直され、非同期に描く mermaid は途中の形で失敗する。
//
// 筆は1行ずつではなく、トピック1つをZ字で書く（それまでは `Range`
// で1文字ずつ位置を取り、行の途中で止めていた）。塊の切り方は `plan.ts`——見出しから
// 次の見出しまでが1つで、段落や表の1つ1つではない。その中の行を上下2つの帯に割り、帯ごとに
// 左から右へなぞって、あいだを斜めに戻る——つまりZ字の3画。帯の切れ目は実際の行の box に
// 合わせるので、文字が上下に切れることはない（1行しかない塊は1画で書く）。
//
// ここはフレームを回すだけで、測るのは `measure.ts`、要素に書くのは
// `paint.ts`、帯の割り出しと帯の上の筆の居場所は `band.ts`（純粋な計算）。
// なぞる右端は帯ごとに、その帯にある行のいちばん右（同ファイル冒頭）。
//
// ミニ立ち絵の立つ位置が画面から出たら器を送る（`brush-scroll.ts`）。追う範囲は
// 帯ぜんたいではなく、帯の下端から立ち絵の高さの見積もりぶん上まで——行の多いトピックでは
// 帯の背が器の見える高さに迫り、帯ぜんたいを収めようとすると送っては戻す往復が起きるため
// （`brush-scroll.ts` 冒頭）。器を送るのはビューポート座標のままだが、配る筆先は本文の
// 入れ物（`data-brush-origin`）の座標へ写す——書き上げたあとも筆先はその場に残るので、
// ビューポート基準のままだと転がすたびに関係ない場所へずれる（`brush-tip.ts`）。
//
// 打ち切る口は2つ（クリック・キー入力）。ホイールと指では打ち切らない——先を読もうと
// して転がすのは「もう要らない」ではなく「見ていたい」の側なので、打ち切ると筆を追うたびに
// 筆が消える。代わりに、手で転がしたら筆先を追う自動送りだけを降ろす
// （`brush-scroll.ts`）。`scroll` そのものを聞かないのは前のまま——スクロールアンカリングや
// `scrollIntoView` でも飛んでくるので、利用者の操作そのものだけを合図にする。
//
// `prefers-reduced-motion: reduce` では演出ごと無効（`theme.css` の規則は CSS の
// アニメーションにしか効かないので、ここでも見る）。

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

import { loadRevealSpeed, revealTimingOf, type RevealTiming } from "../reveal-speed.ts"
import { brushStep, toBands, type BrushStep } from "./band.ts"
import { brushScroller } from "./brush-scroll.ts"
import { BRUSH_ORIGIN_ATTRIBUTE, publishBrushTip, restBrushTip } from "./brush-tip.ts"
import { endLineOf, frameOf, lineBoxesOf, placeIn, shapesOf } from "./measure.ts"
import { applyStep, hideBlock, showBlock } from "./paint.ts"
import { blockProgress, planReveal, type RevealBlock } from "./plan.ts"
import { prefersReducedMotion } from "./reduced-motion.ts"

/** 見せる範囲を進めているあいだだけ根に立てる印（目視確認と、外から終わりを知るための口）。 */
const REVEALING_ATTRIBUTE = "data-revealing"

/**
 * 自動送りが追う範囲（`brush-scroll.ts` の `BrushTipRange.tipHeight`）に渡す、ミニ立ち絵の
 * 高さの見積もり。実測ではなく固定値——`mini-portrait.module.css` の
 * `--mini-portrait-height`（`clamp(60px, 8vmin, 96px)`）の上限に合わせる。狭く見積もって
 * 天井を割ると立ち絵の頭が余白から出るより、広めに見積もって余白が少し余るほうが安全。
 */
const MINI_PORTRAIT_HEIGHT_ESTIMATE_PX = 96

/**
 * 演出を飛ばす合図。本文に触りに来た操作だけを並べる（ホイールと指を入れない理由は冒頭。
 * `scroll` を入れない理由も同じところ）。
 */
const SKIP_EVENT_NAMES = ["pointerdown", "keydown"] as const

/** 合図は捕まえるだけで邪魔しない（`capture` は内側で止められても届かせるため）。 */
const SKIP_LISTENER_OPTIONS = { capture: true, passive: true } as const

/**
 * レポートの根に付ける ref を返す。`reveal` が立っていたら、マウントした直後から見せる範囲を
 * 進める。`turnId` はこの本文が載っているやり取りで、配る筆先に添えて持たせる
 * （`brush-tip.ts`。別のやり取りが出ているあいだ、残った筆先は使われない）。
 *
 * 見るのはマウントした時点の `reveal` だけ。 あとから対象でなくなっても（後ろに別の
 * レポートが現れても）始めた演出は最後まで進める——途中で止めると書きかけの本文が残る。
 * 「書き上げる演出の速さ」（`domain/reveal-speed.ts`）もマウント時の値だけを見る（歯車で
 * 速さを変えても、書いている最中の演出は前の速さのまま進み切る。次に書き始めたときから効く）。
 */
export function useReportReveal(reveal: boolean, turnId: number): RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement>(null)
  const [revealOnMount] = useState(reveal)
  const [revealSpeed] = useState(loadRevealSpeed)
  // 同じ本文を二度書かない。 `<Activity mode="hidden">`（キャラクター画面を開いている間）は
  // 部品の状態を残したまま効果だけを外すので、戻ってきたときにこの効果がもう一度走る。
  const revealedOnce = useRef(false)

  // React の外（DOM の style とフレームのタイマー）を動かす（docs/coding-standards.md「React」の
  // 4類型のうち「タイマー」と「React の外にある状態への書き込み」）。`useLayoutEffect` で
  // なければならない — `useEffect` は描画のあとに走るので、隠す前の本文が1フレームだけ
  // 全部見えてしまう。依存はどちらもマウント時に決まったきり変わらない（`<Turn>` はやり取りの
  // 番号を `key` に持つので、`turnId` が変わるときは部品ごと作り直される）。
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!revealOnMount || revealedOnce.current || root === null || prefersReducedMotion()) {
      return undefined
    }
    // 「切る」は物差しを持たない（`domain/reveal-speed.ts`）。`startReveal` を呼ばずに
    // 済ませると本文はすぐ全部出た状態のままで、ミニ立ち絵の筆も出ない。
    if (revealSpeed === "off") {
      return undefined
    }
    revealedOnce.current = true
    return startReveal(root, turnId, revealTimingOf(revealSpeed))
  }, [revealOnMount, turnId, revealSpeed])

  return rootRef
}

/**
 * 根の下の塊を隠してから、フレームごとに見せる範囲を進める。戻り値を呼ぶとその場で全部出す
 * （スキップと、部品が外れたときの後始末を兼ねる）。`timing` は利用者が選んだ「書き上げる演出の
 * 速さ」の物差し（`off` はここまで来ない。呼び出し側が `startReveal` ごと呼ばずに済ませる）。
 */
function startReveal(root: HTMLElement, turnId: number, timing: RevealTiming): () => void {
  const blocks = planReveal(root, timing)
  if (blocks.length === 0) {
    return () => undefined
  }

  for (const block of blocks) {
    hideBlock(block)
  }
  root.setAttribute(REVEALING_ATTRIBUTE, "yes")

  const scroller = brushScroller(root)
  // 筆先の座標の原点（`brush-tip.ts`）。印が見つからなければ筆先を配らない
  // ——ミニ立ち絵は出ないが、本文を書き上げる演出そのものは進む。
  const origin = root.closest(`[${BRUSH_ORIGIN_ATTRIBUTE}]`)
  // 書き終わりに筆先を残す先（`finish()`）。塊は時間の順に並んでいるので、末尾が最後に書く塊。
  const lastBlock = blocks.at(-1)
  const startedAt = performance.now()
  let frame = 0
  let shown = 0
  let finished = false

  const finish = (): void => {
    if (finished) {
      return
    }
    finished = true
    cancelAnimationFrame(frame)
    // 残すのは「本文の末尾」——最後の塊の最後の行が終わったところで、打ち切られた
    // ときに筆が止まっていた場所ではない。`finish()` は残りを全部出すので、途中で止まった
    // 場所に残すと「まだ書いている途中」に見える。
    const end = lastBlock === undefined ? undefined : endLineOf(lastBlock)
    for (const block of blocks) {
      showBlock(block)
    }
    root.removeAttribute(REVEALING_ATTRIBUTE)
    // 書き終わっても筆先は消さない（飛ばされたときも同じ）。次に書き始めたときだけ移る。
    // 末尾が測れなかったときは、最後に配った位置のまま残す。
    if (origin !== null && end !== undefined) {
      const place = { x: end.right, top: end.top, bottom: end.bottom }
      publishBrushTip({ ...placeIn(origin, place), turnId, phase: "resting" })
    } else {
      restBrushTip()
    }
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
    const step = advanceBlock(current, blockProgress(current, elapsed))
    scroller.follow(
      step === undefined
        ? undefined
        : { tipBottom: step.tipBottom, tipHeight: MINI_PORTRAIT_HEIGHT_ESTIMATE_PX },
    )
    if (origin !== null) {
      publishBrushTip(
        step === undefined
          ? undefined
          : {
              ...placeIn(origin, { x: step.tipX, top: step.tipTop, bottom: step.tipBottom }),
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
 * 塊1つを `progress`（0〜1）まで出し、そのときの筆の居場所を返す（ビューポート座標。
 * 配るときに原点を移す。{@link placeIn}）。
 */
function advanceBlock(block: RevealBlock, progress: number): BrushStep | undefined {
  const shapes = shapesOf(block)
  const frame = frameOf(shapes)
  if (frame === undefined) {
    // まだレイアウトされていない。隠したまま次のフレームで追いつく。
    return undefined
  }

  const step = brushStep(toBands(shapes.flatMap(lineBoxesOf), frame), progress)
  for (const shape of shapes) {
    applyStep(shape, step)
  }

  return step
}
