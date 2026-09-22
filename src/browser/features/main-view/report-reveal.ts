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
// **筆先が画面から出たら器を送る**（`brush-scroll.ts`）。
//
// **止める口は3つ**（スクロール・クリック・キー入力）。ただし `scroll` は聞かない——
// スクロールアンカリングや `scrollIntoView` でも飛んでくるので、**利用者の操作そのもの**
// （ホイール・指・ポインタ・キー）だけを合図にする。
//
// **`prefers-reduced-motion: reduce` では演出ごと無効**（`theme.css` の規則は CSS の
// アニメーションにしか効かないので、ここでも見る）。

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

import { publishBrushTip, type BrushTip } from "../../stores/brush-tip.ts"
import { brushScroller } from "./brush-scroll.ts"
import {
  brushStep,
  toBands,
  type BrushStep,
  type LineBox,
  type RevealFrame,
} from "./reveal-band.ts"
import {
  planReveal,
  type RevealBlock,
  type RevealElement,
  type RevealMember,
} from "./reveal-plan.ts"

/** 見せる範囲を進めているあいだだけ根に立てる印（目視確認と、外から終わりを知るための口）。 */
const REVEALING_ATTRIBUTE = "data-revealing"

/** 何も見せていない状態の `clip-path`（高さ 0 に畳む。場所は取ったまま）。 */
const HIDDEN_CLIP = "inset(0 0 100% 0)"

/** 演出を飛ばす合図。**利用者の操作だけ**を並べる（`scroll` を入れない理由は冒頭）。 */
const SKIP_EVENT_NAMES = ["wheel", "touchmove", "pointerdown", "keydown"] as const

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

  const followTip = brushScroller(root)
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
    publishBrushTip(undefined)
    for (const name of SKIP_EVENT_NAMES) {
      window.removeEventListener(name, finish, SKIP_LISTENER_OPTIONS)
    }
  }

  const step = (): void => {
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
    const tip = advanceBlock(current, progressOf(current, elapsed))
    publishBrushTip(tip)
    followTip(tip)
    frame = requestAnimationFrame(step)
  }

  frame = requestAnimationFrame(step)
  for (const name of SKIP_EVENT_NAMES) {
    window.addEventListener(name, finish, SKIP_LISTENER_OPTIONS)
  }

  return finish
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function progressOf(block: RevealBlock, elapsed: number): number {
  const span = block.endMs - block.startMs
  return span <= 0 ? 1 : clamp((elapsed - block.startMs) / span, 0, 1)
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

/** 塊1つを `progress`（0〜1）まで出し、そのときの筆先を返す。 */
function advanceBlock(block: RevealBlock, progress: number): BrushTip | undefined {
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

  return { x: step.tipX, top: step.tipTop, bottom: step.tipBottom, stroke: step.stroke }
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
