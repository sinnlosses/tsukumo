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
// **筆先が画面から出たら器を送る**（`brush-scroll.ts`）。**器を送るのはビューポート座標のまま**
// だが、配る筆先は本文の入れ物（`data-brush-origin`）の座標へ写す——書き上げたあとも筆先は
// その場に残るので、ビューポート基準のままだと転がすたびに関係ない場所へずれる
// （`stores/brush-tip.ts`）。
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

import {
  BRUSH_ORIGIN_ATTRIBUTE,
  publishBrushTip,
  restBrushTip,
  type BrushTip,
} from "../../stores/brush-tip.ts"
import { brushScroller } from "./brush-scroll.ts"
import {
  brushStep,
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
 * 演出を飛ばす合図。**本文に触りに来た操作だけ**を並べる（ホイールと指を入れない理由は冒頭。
 * `scroll` を入れない理由も同じところ）。
 */
const SKIP_EVENT_NAMES = ["pointerdown", "keydown"] as const

/** 合図は捕まえるだけで邪魔しない（`capture` は内側で止められても届かせるため）。 */
const SKIP_LISTENER_OPTIONS = { capture: true, passive: true } as const

/**
 * レポートの根に付ける ref を返す。`reveal` が立っていたら、**マウントした直後から**見せる範囲を
 * 進める。
 *
 * **見るのはマウントした時点の `reveal` だけ。** あとから対象でなくなっても（後ろに別の
 * レポートが現れても）始めた演出は最後まで進める——途中で止めると書きかけの本文が残る。
 */
export function useReportReveal(reveal: boolean): RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement>(null)
  const [revealOnMount] = useState(reveal)
  // **同じ本文を二度書かない。** `<Activity mode="hidden">`（キャラクター画面を開いている間）は
  // 部品の状態を残したまま効果だけを外すので、戻ってきたときにこの効果がもう一度走る。
  const revealedOnce = useRef(false)

  // React の外（DOM の style とフレームのタイマー）を動かす（docs/coding-standards.md「React」の
  // 4類型のうち「タイマー」と「React の外にある状態への書き込み」）。**`useLayoutEffect` で
  // なければならない** — `useEffect` は描画のあとに走るので、隠す前の本文が1フレームだけ
  // 全部見えてしまう。依存は1つだけで、マウント時に決まったきり変わらない。
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!revealOnMount || revealedOnce.current || root === null || prefersReducedMotion()) {
      return undefined
    }
    revealedOnce.current = true
    return startReveal(root)
  }, [revealOnMount])

  return rootRef
}

/**
 * 根の下の塊を隠してから、フレームごとに見せる範囲を進める。戻り値を呼ぶと**その場で全部出す**
 * （スキップと、部品が外れたときの後始末を兼ねる）。
 */
function startReveal(root: HTMLElement): () => void {
  const blocks = planReveal(root)
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
    for (const block of blocks) {
      showBlock(block)
    }
    root.removeAttribute(REVEALING_ATTRIBUTE)
    // **書き終わっても筆先は消さない**（飛ばされたときも同じ）。書いたところに残して、
    // 次に書き始めたときにそちらへ移る。
    restBrushTip()
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
    scroller.follow(step)
    if (origin !== null) {
      publishBrushTip(step === undefined ? undefined : brushTipAt(step, origin))
    }
    frame = requestAnimationFrame(tick)
  }

  frame = requestAnimationFrame(tick)
  for (const name of SKIP_EVENT_NAMES) {
    window.addEventListener(name, finish, SKIP_LISTENER_OPTIONS)
  }

  return finish
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
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
 * 測った筆の居場所（ビューポート座標）を、**本文の入れ物を原点にした筆先**へ写す
 * （`stores/brush-tip.ts`）。入れ物の矩形は**毎フレーム測り直す**——書いているあいだは器が
 * 送られ、窓の幅も変わりうるので、始めに測った1回では合わなくなる。
 */
function brushTipAt(step: BrushStep, origin: Element): BrushTip {
  const box = origin.getBoundingClientRect()
  return {
    phase: "writing",
    x: step.tipX - box.left,
    top: step.tipTop - box.top,
    bottom: step.tipBottom - box.top,
    stroke: step.stroke,
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
