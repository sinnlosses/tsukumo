// レポートを「書き上げていくように見せる」演出で、どの要素をどの順に出すかを決める（DOM は読むだけで書き換えない）。
//
// 塊は「トピック」。`report` の節1つが1トピックで、境目は `Report` が節ごとに作る欄の入れ物（`data-report-section`）で知る。
// 段落や表の1つ1つではない（細かく割ると出る回数が増えて落ち着かず、目で追えなくなる）。

import { sumBy } from "remeda"

/** 出す順を決められる要素。`opacity` を持つもの（レポートの塊は全部これ）。 */
export type RevealElement = HTMLElement | SVGElement

/** ポンで出す塊1つ。根の直下の子を出す順に並べたもの。 */
export type PopBlock = readonly [RevealElement, ...(readonly RevealElement[])]

/**
 * 図・グラフに与える重み（文字数に換算した値）。
 * 図は文字数を持たないので、文字と同じ物差しに載せるために決め打ちの重みを置く。段落1つぶんに相当させる。
 */
export const FIGURE_WEIGHT = 100

/**
 * 出す対象の重み（文字数。図は1つにつき {@link FIGURE_WEIGHT}）の合計がこれに満たないレポートは、演出せずに出す。
 * 速さの設定には左右されない。
 */
export const SHORT_REPORT_WEIGHT = 200

const FIGURE_SELECTOR = ".mermaid, .mermaid-broken, .chart-block, canvas, svg, img"

/** 頭の欄（結論と検証結果）。演出の対象にせず、最初から出す。 */
const HEAD_REGION_SELECTOR = '[data-report-region="head"]'

/** 節の欄。1つが新しいトピックを始める。 */
const SECTION_REGION_SELECTOR = "[data-report-section]"

/** 出す対象が短く、演出せずに出すレポートか。 */
export function isShortReport(root: Element): boolean {
  return sumBy(popBlocksOf(root).flat(), weightOf) < SHORT_REPORT_WEIGHT
}

/**
 * 根の直下の子を、ポンで出す塊へまとめる（出す順は文書の順）。
 * 頭の欄は入れない（結論と検証結果は最初から出す）。節の欄は新しい塊を始め、ほかの子（振り返り・お願い・Markdown 1本の欄、入れ物でない要素）は直前の塊へ足す。
 */
export function popBlocksOf(root: Element): readonly PopBlock[] {
  return [...root.children]
    .filter(isRevealElement)
    .filter((child) => !child.matches(HEAD_REGION_SELECTOR))
    .reduce<readonly PopBlock[]>((blocks, child) => {
      const last = blocks.at(-1)
      return child.matches(SECTION_REGION_SELECTOR) || last === undefined
        ? [...blocks, [child]]
        : [...blocks.slice(0, -1), [...last, child]]
    }, [])
}

function weightOf(element: RevealElement): number {
  const figures =
    (element.matches(FIGURE_SELECTOR) ? 1 : 0) + element.querySelectorAll(FIGURE_SELECTOR).length
  return (element.textContent ?? "").trim().length + figures * FIGURE_WEIGHT
}

function isRevealElement(node: Element): node is RevealElement {
  return node instanceof HTMLElement || node instanceof SVGElement
}
