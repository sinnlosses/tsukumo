// レポートを「書き上げていくように見せる」演出で、どの塊をいつ出すかを決める（純粋な割り当て。DOM は読むだけで書き換えない）。
//
// DOM は完成品のまま置き、見せる範囲だけを進めるので、ここが返すのは「塊ごとの出し始めと出し終わりの時刻」だけになる。
//
// 塊は「トピック」。`report` の節1つが1トピックで、境目は `reportSectionsMarkdown` が節の間に挟む印で知る。
// 段落や表の1つ1つではない（細かく割ると筆が何度も折り返して落ち着かず、目で追えなくなる）。
//
// 塊1つぶんの時間を決める物差し（`RevealTiming`）は呼び出し側から受け取り、ここは値を持たない。
//
// トピックの中の要素は、見せ方が2種類ある:
//
// - 文字の要素（`text`）: `clip-path` で見せる範囲を進める
// - 図・グラフの要素（`figure`）: 文字の位置が取れない・取っても意味が無いので `opacity` で出す。mermaid と Chart.js は非同期に描いたあとで中身が入れ替わるので、中身ではなく入れ物の class（`mermaid` / `chart-block`）で見分ける（描き終わる前でも後でも同じ判定になる）

import { sumBy } from "remeda"

import type { RevealTiming } from "../reveal-speed.ts"

/** 見せる範囲を進められる要素。`clip-path` と `opacity` を持つもの（レポートの塊は全部これ）。 */
export type RevealElement = HTMLElement | SVGElement

export type RevealBlockKind = "text" | "figure"

/** トピックを構成する要素1つ。 */
export type RevealMember = {
  readonly element: RevealElement
  readonly kind: RevealBlockKind
}

/** 塊（トピック）1つと、それを書いている時間帯（演出を始めてからの経過ミリ秒）。 */
export type RevealBlock = {
  readonly members: readonly [RevealMember, ...(readonly RevealMember[])]
  readonly startMs: number
  readonly endMs: number
}

/**
 * 図・グラフに与える重み（文字数に換算した値）。
 * 図は文字数を持たないので、文字と同じ物差しに載せるために決め打ちの重みを置く。段落1つぶんに相当させる。
 */
const FIGURE_WEIGHT = 100

const FIGURE_SELECTOR = ".mermaid, .mermaid-broken, .chart-block, canvas, svg, img"

/** 節と節の境目の印（`SECTION_BREAK_MARKDOWN` と同じ class 名）。 */
const SECTION_BREAK_SELECTOR = ".report-section-break"

/**
 * 根の直下の要素をトピックへまとめ、書く順（文書の順）に時間を割り当てる。
 * 1つぶんの時間はそのトピックの大きさで決まる（レポート全体の長さに左右されない）。
 *
 * 塊の間に隙間は空けない（前の塊が終わった時刻が次の塊の始まり）。
 */
export function planReveal(root: Element, timing: RevealTiming): readonly RevealBlock[] {
  return toTopics([...root.children].filter(isRevealElement)).reduce<{
    blocks: readonly RevealBlock[]
    at: number
  }>(
    (acc, members) => {
      const endMs = acc.at + topicDurationMs(members, timing)
      return {
        blocks: [...acc.blocks, { members, startMs: acc.at, endMs }],
        at: endMs,
      }
    },
    { blocks: [], at: 0 },
  ).blocks
}

/**
 * 塊1つの中の進み具合（0〜1）。書き始めと書き終わりをゆっくり、途中を速くする（3次のイーズインアウト。真ん中の速さは等速の3倍）。
 *
 * ミニ立ち絵が「そこで書いている」ように見えるのは筆が遅いところだけなので、出だしと締めで見せて、読み手が待つだけの真ん中を速く抜ける。
 * 塊の持ち時間は変えないので、レポート全体の長さは変わらない。
 */
export function blockProgress(block: RevealBlock, elapsedMs: number): number {
  const span = block.endMs - block.startMs
  if (span <= 0) {
    return 1
  }

  const linear = Math.min(Math.max((elapsedMs - block.startMs) / span, 0), 1)
  return linear < 0.5 ? 4 * linear ** 3 : 1 - (2 - 2 * linear) ** 3 / 2
}

/** 節の境目の印で切って、続く要素をひとまとめにする。印そのものはトピックに入れない。 */
function toTopics(
  elements: readonly RevealElement[],
): readonly (readonly [RevealMember, ...(readonly RevealMember[])])[] {
  return elements.reduce<{
    readonly topics: readonly (readonly [RevealMember, ...(readonly RevealMember[])])[]
    readonly atBreak: boolean
  }>(
    (acc, element) => {
      if (isSectionBreak(element)) {
        return { topics: acc.topics, atBreak: true }
      }
      const member: RevealMember = { element, kind: blockKind(element) }
      const last = acc.topics.at(-1)
      return last === undefined || acc.atBreak
        ? { topics: [...acc.topics, [member]], atBreak: false }
        : {
            topics: [...acc.topics.slice(0, -1), [last[0], ...last.slice(1), member]],
            atBreak: false,
          }
    },
    { topics: [], atBreak: false },
  ).topics
}

function isSectionBreak(element: RevealElement): boolean {
  return element.matches(SECTION_BREAK_SELECTOR)
}

function topicDurationMs(members: readonly RevealMember[], timing: RevealTiming): number {
  const weight = sumBy(members, memberWeight)
  return Math.min(Math.max(weight * timing.msPerCharacter, timing.minBlockMs), timing.maxBlockMs)
}

function memberWeight(member: RevealMember): number {
  // 空の段落で時間が 0 にならないよう、文字の要素の重みは最低 1。
  return member.kind === "figure" ? FIGURE_WEIGHT : Math.max(1, textLength(member.element))
}

/**
 * `clip-path` で進めるか、`opacity` で出すか。入れ物の class で見分ける。
 * mermaid は描き終わると `<svg>` に中身が入れ替わり、そこに文字（ラベル）が現れるので、文字の有無だけでは足りない。
 * 文字を1つも持たない要素（画像だけの段落など）も `opacity` で出す。
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
