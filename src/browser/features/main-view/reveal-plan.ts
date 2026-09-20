// レポートを「書き上げていくように見せる」演出で、**どの塊をいつ出すか**を決める（純粋な割り当て。
// DOM は読むだけで書き換えない）。進める側は `report-reveal.ts`。
//
// **文字を足していく実装にしない**（`docs/requirements.md` 4.3）。DOM は完成品のまま置き、
// 見せる範囲だけを進めるので、ここが返すのは「塊ごとの出し始めと出し終わりの時刻」だけになる。
//
// 塊は2種類に分ける:
//
// - **文字の塊（`text`）**: 行の途中で止まる（`report-reveal.ts` が `Range` から筆先を取り、
//   `clip-path` で「その文字まで」を見せる）
// - **図・グラフの塊（`figure`）**: 文字の位置が取れない・取っても意味が無いので**塊ごと**出す
//   （`docs/requirements.md` 4.3「文字を持たない図・グラフの塊は塊ごと出し」）。mermaid と
//   Chart.js は**非同期に描いたあとで中身が入れ替わる**ので、中身ではなく入れ物の class
//   （`mermaid` / `chart-block`。`markdown/mermaid-block.tsx` / `markdown/chart-block.tsx` が付ける）
//   で見分ける——描き終わる前でも後でも同じ判定になる

/** 見せる範囲を進められる要素。`clip-path` と `opacity` を持つもの（レポートの塊は全部これ）。 */
export type RevealElement = HTMLElement | SVGElement

export type RevealBlockKind = "text" | "figure"

/** 塊1つと、その塊を出している時間帯（演出を始めてからの経過ミリ秒）。 */
export type RevealBlock = {
  readonly element: RevealElement
  readonly kind: RevealBlockKind
  readonly startMs: number
  readonly endMs: number
}

/**
 * 図・グラフの塊に与える重み（文字数に換算した値）。**図は文字数を持たない**ので、
 * 文字の塊と同じ物差しに載せるために決め打ちの重みを置く。短い段落1つぶんより少し重い程度。
 */
const FIGURE_WEIGHT = 40

/**
 * 図・グラフ1つのフェードに使ってよい時間の上限。図は位置が動かないので、文字と同じだけ
 * 掛けると**ただ遅いフェード**にしか見えない。
 */
const MAX_FIGURE_FADE_MS = 320

const FIGURE_SELECTOR = ".mermaid, .mermaid-broken, .chart-block, canvas, svg, img"

/**
 * 文字1つぶんの持ち時間。**筆先を目で追える速さ**がこの値で決まる（2026-09-20 のユーザーの
 * 判断。それまではレポート全体で 1400ms 固定だったが、長い本文では1文字 1ms を切って
 * 追えなかった）。
 */
const MS_PER_CHARACTER = 10

/**
 * 文字の塊1つに使ってよい時間の上限。**上限を掛けるのは塊ごとで、レポート全体には掛けない**
 * （2026-09-20 のユーザーの判断）——全体に予算を置いて按分すると、**長いレポートほど1文字が
 * 速くなり**、目で追える速さという狙いがレポートの長さで崩れる。塊ごとなら
 * {@link MS_PER_CHARACTER} がどのレポートでも守られ、打ち切られるのは極端に長い1塊だけになる。
 */
const MAX_TEXT_BLOCK_MS = 2000

/**
 * 根の直下の塊を、書く順（文書の順）に並べて時間を割り当てる。**塊1つぶんの時間はその塊の
 * 文字数で決まる**（レポート全体の長さに左右されない）。
 *
 * 塊の間に隙間は空けない（前の塊が終わった時刻が次の塊の始まり）。
 */
export function planReveal(root: Element): readonly RevealBlock[] {
  return [...root.children]
    .filter(isRevealElement)
    .map(toShape)
    .reduce<{ blocks: readonly RevealBlock[]; at: number }>(
      (acc, shape) => {
        const endMs = acc.at + blockDurationMs(shape)
        return {
          blocks: [
            ...acc.blocks,
            { element: shape.element, kind: shape.kind, startMs: acc.at, endMs },
          ],
          at: endMs,
        }
      },
      { blocks: [], at: 0 },
    ).blocks
}

function blockDurationMs(shape: RevealShape): number {
  const span = shape.weight * MS_PER_CHARACTER
  return Math.min(span, shape.kind === "figure" ? MAX_FIGURE_FADE_MS : MAX_TEXT_BLOCK_MS)
}

/** 時間を割り当てる前の塊（種類と重みだけ）。 */
type RevealShape = {
  readonly element: RevealElement
  readonly kind: RevealBlockKind
  readonly weight: number
}

function toShape(element: RevealElement): RevealShape {
  const kind = blockKind(element)
  return {
    element,
    kind,
    // 空の段落で時間が 0 にならないよう、文字の塊の重みは最低 1。
    weight: kind === "figure" ? FIGURE_WEIGHT : Math.max(1, textLength(element)),
  }
}

/**
 * 塊ごと出すか、文字を追って出すか。**入れ物の class で見分ける**（mermaid は描き終わると
 * `<svg>` に中身が入れ替わり、そこに文字（ラベル）が現れるので、文字の有無だけでは足りない）。
 * 文字を1つも持たない塊（画像だけの段落など）も塊ごと出す。
 */
function blockKind(element: RevealElement): RevealBlockKind {
  if (element.matches(FIGURE_SELECTOR) || element.querySelector(FIGURE_SELECTOR) !== null) {
    return "figure"
  }
  return textLength(element) === 0 ? "figure" : "text"
}

function textLength(element: RevealElement): number {
  return (element.textContent ?? "").trim().length
}

function isRevealElement(node: Element): node is RevealElement {
  return node instanceof HTMLElement || node instanceof SVGElement
}
