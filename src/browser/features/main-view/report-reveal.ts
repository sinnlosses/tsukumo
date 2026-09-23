// 確定したレポートを「書き上げていくように見せる」演出（`docs/requirements.md` 4.3）。
// **DOM は完成品を一度に作り、見せる範囲だけを進める**——文字を足していく実装にすると、表・
// mermaid・Chart.js が未完成のソースで作り直され、非同期に描く mermaid は途中の形で失敗する。
//
// **筆は1行ずつではなく、トピック1つをZ字で書く**（それまでは `Range`
// で1文字ずつ位置を取り、行の途中で止めていた）。塊の切り方は `reveal-plan.ts`——見出しから
// 次の見出しまでが1つで、**段落や表の1つ1つではない**。その中の行を上下2つの帯に割り、帯ごとに
// 左から右へなぞって、あいだを斜めに戻る——つまりZ字の3画。**帯の切れ目は実際の行の box に
// 合わせる**ので、文字が上下に切れることはない（1行しかない塊は1画で書く）。
//
// **ここは測って書くだけ**で、帯の割り出しと帯の上の筆の居場所は `reveal-band.ts`（純粋な計算）。
// なぞる右端は**帯ごとに、その帯にある行のいちばん右**（同ファイル冒頭）。
//
// 帯は**要素をまたいで1本に伸びる**（見出しと段落と表が同じ帯に入る）。だから筆の居場所は
// ビューポート座標で1つだけ持ち、要素ごとの見せ方へ {@link applyStep} で翻訳する:
//
// - 文字の要素は、Z字が通ったところまでを `clip-path` のポリゴンで見せる
// - 図・グラフの要素は、筆が通り過ぎた割合を `opacity` にする。**入れ物に触るだけ**なので、
//   mermaid と Chart.js が描き直されることはない（部品は `memo` のまま一度しかマウントされない）
//
// どちらもレイアウトを動かさない（`clip-path` も `opacity` も場所を取ったまま隠す）ので、
// 本文の高さは最初から最後まで変わらない。
//
// **ミニ立ち絵の立つ位置が画面から出たら器を送る**（`brush-scroll.ts`）。追う範囲は
// 帯ぜんたいではなく、帯の下端から立ち絵の高さの見積もりぶん上まで——行の多いトピックでは
// 帯の背が器の見える高さに迫り、帯ぜんたいを収めようとすると送っては戻す往復が起きるため
// （`brush-scroll.ts` 冒頭）。**器を送るのはビューポート座標のまま**だが、配る筆先は本文の
// 入れ物（`data-brush-origin`）の座標へ写す——書き上げたあとも筆先はその場に残るので、
// ビューポート基準のままだと転がすたびに関係ない場所へずれる（`stores/brush-tip.ts`）。
//
// **打ち切る口は2つ**（クリック・キー入力）。**ホイールと指では打ち切らない**——先を読もうと
// して転がすのは「もう要らない」ではなく「見ていたい」の側なので、打ち切ると筆を追うたびに
// 筆が消える。代わりに、手で転がしたら**筆先を追う自動送りだけを降ろす**
// （`brush-scroll.ts`）。`scroll` そのものを聞かないのは前のまま——スクロールアンカリングや
// `scrollIntoView` でも飛んでくるので、**利用者の操作そのもの**だけを合図にする。
//
// **`prefers-reduced-motion: reduce` では演出ごと無効**（`theme.css` の規則は CSS の
// アニメーションにしか効かないので、ここでも見る）。

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

import { prefersReducedMotion } from "../../lib/reduced-motion.ts"
import { loadRevealSpeed, revealTimingOf, type RevealTiming } from "../../lib/reveal-speed.ts"
import {
  BRUSH_ORIGIN_ATTRIBUTE,
  publishBrushTip,
  restBrushTip,
  type BrushPlace,
} from "../../stores/brush-tip.ts"
import { brushScroller } from "./brush-scroll.ts"
import {
  brushStep,
  lastLineOf,
  toBands,
  type BrushStep,
  type LineBox,
  type RevealFrame,
} from "./reveal-band.ts"
import {
  blockProgress,
  planReveal,
  type RevealBlock,
  type RevealElement,
  type RevealMember,
} from "./reveal-plan.ts"

/** 見せる範囲を進めているあいだだけ根に立てる印（目視確認と、外から終わりを知るための口）。 */
const REVEALING_ATTRIBUTE = "data-revealing"

/** 何も見せていない状態の `clip-path`（高さ 0 に畳む。場所は取ったまま）。 */
const HIDDEN_CLIP = "inset(0 0 100% 0)"

/**
 * 自動送りが追う範囲（`brush-scroll.ts` の `BrushTipRange.tipHeight`）に渡す、ミニ立ち絵の
 * 高さの見積もり。**実測ではなく固定値**——`mini-portrait.module.css` の
 * `--mini-portrait-height`（`clamp(60px, 8vmin, 96px)`）の上限に合わせる。狭く見積もって
 * 天井を割ると立ち絵の頭が余白から出るより、広めに見積もって余白が少し余るほうが安全。
 */
const MINI_PORTRAIT_HEIGHT_ESTIMATE_PX = 96

/**
 * 演出を飛ばす合図。**本文に触りに来た操作だけ**を並べる（ホイールと指を入れない理由は冒頭。
 * `scroll` を入れない理由も同じところ）。
 */
const SKIP_EVENT_NAMES = ["pointerdown", "keydown"] as const

/** 合図は捕まえるだけで邪魔しない（`capture` は内側で止められても届かせるため）。 */
const SKIP_LISTENER_OPTIONS = { capture: true, passive: true } as const

/**
 * レポートの根に付ける ref を返す。`reveal` が立っていたら、**マウントした直後から**見せる範囲を
 * 進める。`turnId` は**この本文が載っているやり取り**で、配る筆先に添えて持たせる
 * （`stores/brush-tip.ts`。別のやり取りが出ているあいだ、残った筆先は使われない）。
 *
 * **見るのはマウントした時点の `reveal` だけ。** あとから対象でなくなっても（後ろに別の
 * レポートが現れても）始めた演出は最後まで進める——途中で止めると書きかけの本文が残る。
 * **「書き上げる演出の速さ」（`lib/reveal-speed.ts`）もマウント時の値だけを見る**（歯車で
 * 速さを変えても、書いている最中の演出は前の速さのまま進み切る。次に書き始めたときから効く）。
 */
export function useReportReveal(reveal: boolean, turnId: number): RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement>(null)
  const [revealOnMount] = useState(reveal)
  const [revealSpeed] = useState(loadRevealSpeed)
  // **同じ本文を二度書かない。** `<Activity mode="hidden">`（キャラクター画面を開いている間）は
  // 部品の状態を残したまま効果だけを外すので、戻ってきたときにこの効果がもう一度走る。
  const revealedOnce = useRef(false)

  // React の外（DOM の style とフレームのタイマー）を動かす（docs/coding-standards.md「React」の
  // 4類型のうち「タイマー」と「React の外にある状態への書き込み」）。**`useLayoutEffect` で
  // なければならない** — `useEffect` は描画のあとに走るので、隠す前の本文が1フレームだけ
  // 全部見えてしまう。依存はどちらもマウント時に決まったきり変わらない（`<Turn>` はやり取りの
  // 番号を `key` に持つので、`turnId` が変わるときは部品ごと作り直される）。
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!revealOnMount || revealedOnce.current || root === null || prefersReducedMotion()) {
      return undefined
    }
    // **「切る」は物差しを持たない**（`lib/reveal-speed.ts`）。`startReveal` を呼ばずに
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
 * 根の下の塊を隠してから、フレームごとに見せる範囲を進める。戻り値を呼ぶと**その場で全部出す**
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
  // 筆先の座標の原点（`stores/brush-tip.ts`）。**印が見つからなければ筆先を配らない**
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
    // **残すのは「本文の末尾」**——最後の塊の**最後の行が終わったところ**で、打ち切られた
    // ときに筆が止まっていた場所ではない。`finish()` は残りを全部出すので、途中で止まった
    // 場所に残すと「まだ書いている途中」に見える。
    const end = lastBlock === undefined ? undefined : endLineOf(lastBlock)
    for (const block of blocks) {
      showBlock(block)
    }
    root.removeAttribute(REVEALING_ATTRIBUTE)
    // **書き終わっても筆先は消さない**（飛ばされたときも同じ）。次に書き始めたときだけ移る。
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
    // 通り過ぎた塊は出し切る。**塊は時間の順に並んでいる**ので、先頭から数えるだけでよい。
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

function hideBlock(block: RevealBlock): void {
  for (const member of block.members) {
    if (member.kind === "figure") {
      member.element.style.opacity = "0"
    } else {
      member.element.style.clipPath = HIDDEN_CLIP
    }
  }
}

function showBlock(block: RevealBlock): void {
  for (const member of block.members) {
    member.element.style.removeProperty(member.kind === "figure" ? "opacity" : "clip-path")
  }
}

/** 要素1つと、そのいまの位置。1フレームの中で box を2度測らないために組で持ち回る。 */
type MemberShape = {
  readonly member: RevealMember
  readonly box: DOMRect
}

/**
 * 塊1つを `progress`（0〜1）まで出し、そのときの筆の居場所を返す（**ビューポート座標**。
 * 配るときに原点を移す。{@link brushTipAt}）。
 */
function advanceBlock(block: RevealBlock, progress: number): BrushStep | undefined {
  const shapes = block.members.map((member) => ({
    member,
    box: member.element.getBoundingClientRect(),
  }))
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

/**
 * 書き終わりの行（ビューポート座標）。**行が1つも取れない塊では無い**——そのときは筆先を
 * 置き直さず、最後に配ったところへ落とす（`finish()`）。
 */
function endLineOf(block: RevealBlock): LineBox | undefined {
  const shapes = block.members.map((member) => ({
    member,
    box: member.element.getBoundingClientRect(),
  }))
  return lastLineOf(shapes.flatMap(lineBoxesOf))
}

/**
 * 測った居場所（ビューポート座標）を、**本文の入れ物を原点にした座標**へ写す
 * （`stores/brush-tip.ts`）。入れ物の矩形は**毎フレーム測り直す**——書いているあいだは器が
 * 送られ、窓の幅も変わりうるので、始めに測った1回では合わなくなる。
 */
function placeIn(origin: Element, viewport: BrushPlace): BrushPlace {
  const box = origin.getBoundingClientRect()
  return {
    x: viewport.x - box.left,
    top: viewport.top - box.top,
    bottom: viewport.bottom - box.top,
  }
}

/**
 * 塊を囲む枠。**筆が枠から出ないための落とし先**で、なぞる右端そのものではない
 * （右端は帯ごとに決まる。`reveal-band.ts`）。
 */
function frameOf(shapes: readonly MemberShape[]): RevealFrame | undefined {
  const boxes = shapes.map((shape) => shape.box).filter((box) => box.width > 0 || box.height > 0)
  const first = boxes.at(0)
  if (first === undefined) {
    return undefined
  }

  return {
    left: boxes.reduce((left, box) => Math.min(left, box.left), first.left),
    right: boxes.reduce((right, box) => Math.max(right, box.right), first.right),
  }
}

/**
 * 要素の中の行。**文字そのものの矩形だけ**を返す——文字の要素に `range.selectNodeContents` を
 * かけると、箇条書きの `<li>` や表の `<tr>` のような**ブロックの箱まで混じって右端が行の幅では
 * なく欄の幅になる**ので、文字の節点を1つずつ測る。
 *
 * **図・グラフは行を持たない**ので、その要素の box をまるごと1行として扱う（筆はその上を
 * 1画で通る）。
 */
function lineBoxesOf(shape: MemberShape): readonly LineBox[] {
  if (shape.member.kind === "figure") {
    return shape.box.height > 0
      ? [{ top: shape.box.top, bottom: shape.box.bottom, right: shape.box.right }]
      : []
  }

  return textNodesOf(shape.member.element).flatMap((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    return [...range.getClientRects()]
      .filter((rect) => rect.height > 0 && rect.width > 0)
      .map((rect) => ({ top: rect.top, bottom: rect.bottom, right: rect.right }))
  })
}

/** 要素の下にある文字の節点。**空白だけのもの**（タグのあいだの改行）は数えない。 */
function textNodesOf(element: RevealElement): readonly Node[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: Node[] = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.nodeValue ?? "").trim().length > 0) {
      nodes.push(node)
    }
  }
  return nodes
}

/** 塊ぜんたいの筆の居場所を、要素1つぶんの見せ方に翻訳する。 */
function applyStep(shape: MemberShape, step: BrushStep): void {
  const box = shape.box
  const filled = clamp(step.filled - box.top, 0, box.height)
  const bottom = clamp(step.bottom - box.top, filled, box.height)

  if (shape.member.kind === "figure") {
    // 筆がこの要素の上を通り過ぎた割合。戻りのあいだは `swept` が 0 なので薄くならない。
    const swept = filled + (bottom - filled) * step.swept
    shape.member.element.style.opacity =
      box.height === 0 ? "0" : String(clamp(swept / box.height, 0, 1))
    return
  }

  const x = clamp(step.writtenX - box.left, 0, box.width)
  shape.member.element.style.clipPath =
    `polygon(0px 0px, ${px(box.width)} 0px, ${px(box.width)} ${px(filled)}, ` +
    `${px(x)} ${px(filled)}, ${px(x)} ${px(bottom)}, 0px ${px(bottom)})`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function px(value: number): string {
  return `${String(Math.round(value))}px`
}
