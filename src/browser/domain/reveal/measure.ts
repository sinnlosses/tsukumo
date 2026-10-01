// レポートを「書き上げていくように見せる」演出で、本文の DOM を測る（読むだけで書き換えない）。
//
// 測るのは塊の中の行（`lineBoxesOf`）と、塊を囲む枠（`frameOf`）。
// 行は帯の割り出しの材料で、書き終わりの行（`endLineOf`）も同じ測り方から出す。
// 枠は行が1つも取れない塊の落とし先で、なぞる右端そのものではない（右端は帯ごとに決まる）。
//
// 塊1つぶんは、書き始めるときと box が変わる出来事のときにだけ測る（`layoutOf`）。
// `clip-path` も `opacity` もレイアウトを動かさないので、そのあいだに box は動かない。
// ただし器が送られるとビューポート座標は動くので、持ち回る値は本文と一緒に転がる基準の要素の左上を原点にする。
//
// `layoutOf` と `endLineOf` が返すのは基準の座標で、`lineBoxesOf` はビューポート座標。

import { lastLineOf, toBands, type LineBox, type RevealBands, type RevealFrame } from "./band.ts"
import type { RevealBlock, RevealElement, RevealMember } from "./plan.ts"

/** 要素1つと、その位置。帯と見せ方の両方が同じ box を使うので組で持ち回る。 */
export type MemberShape = {
  readonly member: RevealMember
  readonly box: DOMRect
}

/** 塊1つぶんを測った結果（どれも基準の座標）。 */
export type BlockLayout = {
  readonly shapes: readonly MemberShape[]
  readonly bands: RevealBands
  /**
   * 塊の要素のほかに測った要素（図・グラフの中に描かれた `svg` / `canvas`）。
   * Chart.js は入れ物の寸法が変わったあとで遅れて描き直すので、入れ物だけを見張ると縮んだ図の右端を拾い損ねる。
   */
  readonly drawn: readonly Element[]
}

/**
 * 塊の要素と帯を測り、`base` の左上を原点にした座標へずらす。
 * まだレイアウトされていない塊（枠が取れない）では無い。
 */
export function layoutOf(block: RevealBlock, base: Element): BlockLayout | undefined {
  const shapes = shapesOf(block)
  const frame = frameOf(shapes)
  if (frame === undefined) {
    return undefined
  }

  const origin = base.getBoundingClientRect()
  const lines = shapes.flatMap(lineBoxesOf).map((line) => lineIn(origin, line))
  return {
    shapes: shapes.map((shape) => ({ member: shape.member, box: boxIn(origin, shape.box) })),
    bands: toBands(lines, { left: frame.left - origin.left, right: frame.right - origin.left }),
    drawn: shapes.flatMap((shape) => {
      const drawn = shape.member.kind === "figure" ? drawnOf(shape.member.element) : undefined
      return drawn === undefined || drawn === shape.member.element ? [] : [drawn]
    }),
  }
}

/**
 * 書き終わりの行（`base` の座標）。
 * 行が1つも取れない塊では無く、そのときは筆先を置き直さず、最後に配ったところへ落とす。
 */
export function endLineOf(block: RevealBlock, base: Element): LineBox | undefined {
  const line = lastLineOf(shapesOf(block).flatMap(lineBoxesOf))
  return line === undefined ? undefined : lineIn(base.getBoundingClientRect(), line)
}

/**
 * 要素の中の行（ビューポート座標）。文字そのものの矩形だけを返す。
 * 文字の要素に `range.selectNodeContents` をかけると、箇条書きの `<li>` や表の `<tr>` のようなブロックの箱まで混じって右端が行の幅ではなく欄の幅になるので、文字の節点を1つずつ測る。
 *
 * 図・グラフは行を持たないので、その要素の box をまるごと1行として扱う（筆はその上を1画で通る）。
 * ただし右端は入れ物ではなく描かれた `svg` / `canvas` の右端を使う。
 * mermaid（`.mermaid`）や Chart.js（`.chart-block`）は全幅の入れ物に描くので、入れ物の box をそのまま使うと帯が図の実際の幅より広く残る。
 */
export function lineBoxesOf(shape: MemberShape): readonly LineBox[] {
  if (shape.member.kind === "figure") {
    const box = drawnBoxOf(shape.member.element) ?? shape.box
    return box.height > 0 ? [{ top: box.top, bottom: box.bottom, right: box.right }] : []
  }

  return textNodesOf(shape.member.element).flatMap((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    return [...range.getClientRects()]
      .filter((rect) => rect.height > 0 && rect.width > 0)
      .map((rect) => ({ top: rect.top, bottom: rect.bottom, right: rect.right }))
  })
}

/** 塊の要素を、そのときの位置と組にして測る（`getBoundingClientRect()` は要素につき1回）。 */
function shapesOf(block: RevealBlock): readonly MemberShape[] {
  return block.members.map((member) => ({
    member,
    box: member.element.getBoundingClientRect(),
  }))
}

function lineIn(origin: DOMRect, line: LineBox): LineBox {
  return {
    top: line.top - origin.top,
    bottom: line.bottom - origin.top,
    right: line.right - origin.left,
  }
}

function boxIn(origin: DOMRect, box: DOMRect): DOMRect {
  return new DOMRect(box.x - origin.left, box.y - origin.top, box.width, box.height)
}

/** 塊を囲む枠。筆が枠から出ないための落とし先で、なぞる右端そのものではない。 */
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
 * 図・グラフの入れ物の中で実際に描かれた `svg` / `canvas` の box。
 * 要素自身が `svg` / `canvas` ならそれ自身、mermaid や Chart.js のように入れ物に描いているならその中の1つ目を測る（`img` は対象外）。
 * 描かれる前（mermaid が非同期で描き終える前）や描画に失敗した塊（`mermaid-broken`）では見つからず、呼び出し側が入れ物の box にそのまま落とす。
 */
function drawnBoxOf(element: RevealElement): DOMRect | undefined {
  return drawnOf(element)?.getBoundingClientRect()
}

function drawnOf(element: RevealElement): Element | undefined {
  return element.matches("svg, canvas")
    ? element
    : (element.querySelector("svg, canvas") ?? undefined)
}

/** 要素の下にある文字の節点。空白だけのもの（タグのあいだの改行）は数えない。 */
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
