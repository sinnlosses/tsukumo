// レポートを「書き上げていくように見せる」演出で、**本文の DOM を測る**（読むだけで書き換え
// ない。要素に書くのは `reveal-paint.ts`、進めるのは `hooks/use-report-reveal.ts`）。
//
// 測るのは3つ:
//
// - **塊の中の行**（{@link lineBoxesOf}）。帯の割り出し（`reveal-band.ts`）の材料で、
//   書き終わりの行（{@link endLineOf}）も同じ測り方から出す
// - **塊を囲む枠**（{@link frameOf}）。**行が1つも取れない塊の落とし先**で、なぞる右端
//   そのものではない（右端は帯ごとに決まる。`reveal-band.ts`）
// - **筆先を配る座標**（{@link placeIn}）。ビューポート座標を本文の入れ物の座標へ写す
//
// **どれも呼ばれるたびに測り直す。** 書いているあいだは器が送られ、窓の幅も変わりうるので、
// 始めに測った1回では合わなくなる。
//
// ここが返す値はすべて**ビューポート座標**（{@link placeIn} を通したものだけが本文の入れ物の
// 座標）。

import { type BrushPlace } from "../../stores/brush-tip.ts"
import { lastLineOf, type LineBox, type RevealFrame } from "./reveal-band.ts"
import { type RevealBlock, type RevealElement, type RevealMember } from "./reveal-plan.ts"

/** 要素1つと、そのいまの位置。1フレームの中で box を2度測らないために組で持ち回る。 */
export type MemberShape = {
  readonly member: RevealMember
  readonly box: DOMRect
}

/** 塊の要素を、そのときの位置と組にして測る（`getBoundingClientRect()` は要素につき1回）。 */
export function shapesOf(block: RevealBlock): readonly MemberShape[] {
  return block.members.map((member) => ({
    member,
    box: member.element.getBoundingClientRect(),
  }))
}

/**
 * 書き終わりの行（ビューポート座標）。**行が1つも取れない塊では無い**——そのときは筆先を
 * 置き直さず、最後に配ったところへ落とす（`hooks/use-report-reveal.ts` の `finish()`）。
 */
export function endLineOf(block: RevealBlock): LineBox | undefined {
  return lastLineOf(shapesOf(block).flatMap(lineBoxesOf))
}

/**
 * 測った居場所（ビューポート座標）を、**本文の入れ物を原点にした座標**へ写す
 * （`stores/brush-tip.ts`）。入れ物の矩形は**毎フレーム測り直す**——書いているあいだは器が
 * 送られ、窓の幅も変わりうるので、始めに測った1回では合わなくなる。
 */
export function placeIn(origin: Element, viewport: BrushPlace): BrushPlace {
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
export function frameOf(shapes: readonly MemberShape[]): RevealFrame | undefined {
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
export function lineBoxesOf(shape: MemberShape): readonly LineBox[] {
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
