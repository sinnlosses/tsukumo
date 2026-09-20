// 確定したレポートを「書き上げていくように見せる」演出（`docs/requirements.md` 4.3）。
// **DOM は完成品を一度に作り、見せる範囲だけを進める**——文字を足していく実装にすると、表・
// mermaid・Chart.js が未完成のソースで作り直され、非同期に描く mermaid は途中の形で失敗する。
//
// 進め方は塊ごとに2つ（割り当ては `reveal-plan.ts`）:
//
// - 文字の塊は `Range` から「その文字まで」の位置を取り、`clip-path` のポリゴンで見せる。
//   **行の途中で止まる**ので、本当に書いているように見える
// - 図・グラフの塊は `opacity` で塊ごとフェード。**入れ物に触るだけ**なので、mermaid と
//   Chart.js が描き直されることはない（部品は `memo` のまま一度しかマウントされない）
//
// どちらもレイアウトを動かさない（`clip-path` も `opacity` も場所を取ったまま隠す）ので、
// 本文の高さは最初から最後まで変わらない。
//
// **止める口は3つ**（スクロール・クリック・キー入力）。ただし `scroll` は聞かない——
// スクロールアンカリングや `scrollIntoView` でも飛んでくるので、**利用者の操作そのもの**
// （ホイール・指・ポインタ・キー）だけを合図にする。
//
// **`prefers-reduced-motion: reduce` では演出ごと無効**（`theme.css` の規則は CSS の
// アニメーションにしか効かないので、ここでも見る）。

import { useLayoutEffect, useRef, useState, type RefObject } from "react"

import { publishBrushTip, type BrushTip } from "../../stores/brush-tip.ts"
import { planReveal, type RevealBlock, type RevealElement } from "./reveal-plan.ts"

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
    for (let block = blocks.at(shown); block !== undefined && block.endMs <= elapsed; ) {
      showBlock(block)
      shown += 1
      block = blocks.at(shown)
    }

    const current = blocks.at(shown)
    if (current === undefined) {
      finish()
      return
    }
    publishBrushTip(advanceBlock(current, progressOf(current, elapsed)))
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
  if (block.kind === "figure") {
    block.element.style.opacity = "0"
    return
  }
  block.element.style.clipPath = HIDDEN_CLIP
}

function showBlock(block: RevealBlock): void {
  block.element.style.removeProperty(block.kind === "figure" ? "opacity" : "clip-path")
}

/** 塊1つを `progress`（0〜1）まで出し、そのときの筆先を返す。 */
function advanceBlock(block: RevealBlock, progress: number): BrushTip | undefined {
  return block.kind === "figure"
    ? advanceFigure(block.element, progress)
    : advanceText(block.element, progress)
}

/**
 * 図・グラフの塊を塊ごとフェードさせる。筆先は**塊の左端**（ミニ立ち絵はその脇に立つ。
 * `docs/requirements.md` 4.3）。
 */
function advanceFigure(element: RevealElement, progress: number): BrushTip | undefined {
  element.style.opacity = String(progress)
  const box = element.getBoundingClientRect()
  return box.width === 0 && box.height === 0
    ? undefined
    : { x: box.left, top: box.top, bottom: box.bottom }
}

/**
 * 文字の塊を「先頭から `progress` の位置の文字まで」見せる。**書き終えた行は丸ごと、書いている
 * 行はその文字まで**のポリゴンにするので、行の途中で止まる。
 *
 * 位置が取れない（まだレイアウトされていない・文字が1つも無い）ときは隠したままにする——
 * 戻り値が undefined でも演出は進み続け、次の塊で追いつく。
 */
function advanceText(element: RevealElement, progress: number): BrushTip | undefined {
  const box = element.getBoundingClientRect()
  const written = writtenRect(element, progress)
  if (written === undefined || box.width === 0) {
    element.style.clipPath = HIDDEN_CLIP
    return undefined
  }

  const x = clamp(written.right - box.left, 0, box.width)
  const top = clamp(written.top - box.top, 0, box.height)
  const bottom = clamp(written.bottom - box.top, 0, box.height)
  element.style.clipPath =
    `polygon(0px 0px, ${px(box.width)} 0px, ${px(box.width)} ${px(top)}, ` +
    `${px(x)} ${px(top)}, ${px(x)} ${px(bottom)}, 0px ${px(bottom)})`

  return { x: written.right, top: written.top, bottom: written.bottom }
}

/**
 * 塊の先頭から数えて `progress` ぶんの文字を囲む `Range` の、**最後の行の矩形**。
 * 行ごとに1つ返る `getClientRects()` の末尾がそのまま「いま書いている行」になる。
 */
function writtenRect(element: RevealElement, progress: number): DOMRect | undefined {
  const nodes = textNodesOf(element)
  const total = nodes.reduce((sum, node) => sum + node.data.length, 0)
  const end = positionAt(nodes, Math.ceil(progress * total))
  if (end === undefined) {
    return undefined
  }

  const range = document.createRange()
  range.setStart(element, 0)
  range.setEnd(end.node, end.offset)
  const rects = range.getClientRects()
  return rects.item(rects.length - 1) ?? undefined
}

/** 先頭から数えて `index` 文字目の位置。1文字も書いていない・文字が無いときは undefined。 */
function positionAt(
  nodes: readonly Text[],
  index: number,
): { readonly node: Text; readonly offset: number } | undefined {
  if (index <= 0) {
    return undefined
  }

  let remaining = index
  for (const node of nodes) {
    if (remaining <= node.data.length) {
      return { node, offset: remaining }
    }
    remaining -= node.data.length
  }

  const last = nodes.at(-1)
  return last === undefined ? undefined : { node: last, offset: last.data.length }
}

/** 塊の中の文字の節点を、文書の順に集める。 */
function textNodesOf(node: Node): readonly Text[] {
  return [...node.childNodes].flatMap((child) =>
    child instanceof Text ? [child] : textNodesOf(child),
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function px(value: number): string {
  return `${String(Math.round(value))}px`
}
