// レポートの紙面を数える物差し。描いた DOM と computed style、報告欄の画素を決まった規則で数え、
// 数・px・真偽だけを返す（本文と入力の文字列は値に入れない）。

import type { Page } from "playwright-core"

import { MAIN_REGION_SELECTOR } from "./capture-page.ts"
import { FIGURE_SELECTOR } from "./paper-figure-selector.ts"
import { hueFamilies } from "./paper-hue.ts"
import { decodePng } from "./png-pixel.ts"

/** 高さがこの割合を超える図を「読む面を超える図」に数える。 */
const OVERSIZED_FIGURE_RATIO = 0.7

const DETAIL_BLOCK_SELECTOR = '[data-main-view-content] [class*="detail-block_"]'

type StackedCount = { readonly total: number; readonly stacked: number }

/** 結論の頭の、読む面の上端からの px。 */
type Verdict = { readonly kind: "absent" } | { readonly kind: "at"; readonly top: number }

/** 図1の上端の px と、最初の1画面（読む面の高さ）に入るか。 */
type FirstFigure =
  | { readonly kind: "absent" }
  | { readonly kind: "at"; readonly top: number; readonly inFirstScreen: boolean }

/** mermaid の svg の文字（自然な大きさ 16px × 縮尺）の最小 px と、`SMALL_TEXT_PX` 未満の図の数。 */
type DiagramText =
  | { readonly kind: "absent" }
  | {
      readonly kind: "at"
      readonly count: number
      readonly smallest: number
      readonly belowSmall: number
    }

/** 図の文字がこの px 未満の図を数える。 */
const SMALL_TEXT_PX = 11

export type PaperMetric = {
  readonly leftRules: number
  readonly statStrips: number
  readonly numberedLists: number
  readonly emoji: number
  readonly boldPerParagraph: { readonly bold: number; readonly paragraphs: number }
  /** 族の始まりの度と画素数。度の昇順。 */
  readonly hueFamilies: readonly (readonly [number, number])[]
  readonly hueFamilyCount: number
  readonly readingHeight: number
  readonly verdict: Verdict
  readonly firstFigure: FirstFigure
  readonly figures: number
  readonly oversizedFigures: number
  readonly diagramText: DiagramText
  readonly stackedBlocks: {
    readonly stats: StackedCount
    readonly compare: StackedCount
    readonly beforeAfter: StackedCount
    readonly options: StackedCount
    readonly files: StackedCount
  }
}

export async function measurePaperMetric(page: Page): Promise<PaperMetric> {
  const dom = await page.evaluate(
    ({ blockSelector, mainSelector, ratio, figureSelector }) => {
      const blocks = Array.from(document.querySelectorAll(blockSelector))
      const within = (name: string): Element[] =>
        blocks.flatMap((block) => Array.from(block.querySelectorAll(`[class*="${name}_"]`)))

      const probe = document.createElement("div")
      probe.style.border = "1px solid"
      document.body.append(probe)
      const ruleColors = new Set(
        ["--rule", "--rule-quiet", "--rule-soft"].map((name) => {
          probe.style.borderColor = `var(${name})`
          return getComputedStyle(probe).borderTopColor
        }),
      )
      probe.remove()
      const leftRules = blocks
        .flatMap((block) => Array.from(block.querySelectorAll("*")))
        .filter((element) => {
          const style = getComputedStyle(element)
          return (
            style.borderLeftStyle !== "none" &&
            parseFloat(style.borderLeftWidth) >= 2 &&
            !ruleColors.has(style.borderLeftColor)
          )
        }).length

      const optionBlocks = within("report-options")
      const numberedLists =
        blocks.flatMap((block) => Array.from(block.querySelectorAll("ol"))).length +
        optionBlocks.filter((block) => block.querySelector('[class*="report-option-number_"]'))
          .length
      const emoji = blocks.reduce(
        (sum, block) => sum + (block.textContent.match(/\p{Extended_Pictographic}/gu)?.length ?? 0),
        0,
      )
      const bold = blocks.flatMap((block) => Array.from(block.querySelectorAll("strong, b"))).length
      const paragraphs = blocks.flatMap((block) => Array.from(block.querySelectorAll("p"))).length

      const main = document.querySelector(mainSelector)
      const mainTop = main?.getBoundingClientRect().top ?? 0
      const scrolled = main?.scrollTop ?? 0
      const readingHeight = main?.clientHeight ?? 0
      const topOf = (element: Element): number =>
        element.getBoundingClientRect().top - mainTop + scrolled

      const verdict =
        document.querySelector('[data-main-view-content] [class*="report-catalog_"]') ??
        document.querySelector('[data-main-view-content] [class*="report-conclusion-lead_"]')

      const candidates = blocks.flatMap((block) =>
        Array.from(block.querySelectorAll(figureSelector)),
      )
      const figures = candidates.filter(
        (element) => !candidates.some((other) => other !== element && other.contains(element)),
      )
      const oversizedFigures = figures.filter(
        (element) => element.getBoundingClientRect().height > readingHeight * ratio,
      ).length
      const firstFigure = figures.slice(0, 1)
      const diagramTextPx = blocks
        .flatMap((block) => Array.from(block.querySelectorAll<SVGSVGElement>("pre.mermaid svg")))
        .flatMap((svg) => {
          const natural = svg.viewBox.baseVal
          const box = svg.getBoundingClientRect()
          return natural.width > 0 && natural.height > 0 && box.width > 0
            ? [16 * Math.min(box.width / natural.width, box.height / natural.height)]
            : []
        })

      // evaluate でブラウザへ文字列として渡すので、外へ出すと届かない
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const isStacked = (sides: readonly Element[]): boolean => {
        const rects = sides
          .map((side) => side.getBoundingClientRect())
          .filter((rect) => rect.height > 0)
        return (
          rects.length >= 2 &&
          rects.every((a, i) =>
            rects.every((b, j) => i >= j || b.top >= a.bottom - 1 || a.top >= b.bottom - 1),
          )
        )
      }
      const stackedOf = (
        name: string,
        stackedBlock: (block: Element) => boolean,
      ): { total: number; stacked: number } => {
        const found = within(name)
        return { total: found.length, stacked: found.filter(stackedBlock).length }
      }
      const byChildren = (block: Element): boolean => isStacked(Array.from(block.children))

      return {
        leftRules,
        statStrips: within("report-stats").length,
        numberedLists,
        emoji,
        boldPerParagraph: { bold, paragraphs },
        readingHeight,
        verdictTops: verdict === null ? [] : [topOf(verdict)],
        firstFigureTops: firstFigure.map(topOf),
        figures: figures.length,
        oversizedFigures,
        diagramTextPx,
        stackedBlocks: {
          stats: stackedOf("report-stats", byChildren),
          compare: stackedOf("report-compare", byChildren),
          beforeAfter: stackedOf("report-before-after", byChildren),
          options: stackedOf("report-options", byChildren),
          files: stackedOf("report-files", (block) =>
            Array.from(block.querySelectorAll('[class*="report-file_"]')).some(byChildren),
          ),
        },
      }
    },
    {
      blockSelector: DETAIL_BLOCK_SELECTOR,
      mainSelector: MAIN_REGION_SELECTOR,
      ratio: OVERSIZED_FIGURE_RATIO,
      figureSelector: FIGURE_SELECTOR,
    },
  )

  const families = await hueFamiliesOfReport(page)
  const { verdictTops, firstFigureTops, diagramTextPx, ...counts } = dom
  const verdictTop = verdictTops[0]
  const figureTop = firstFigureTops[0]
  return {
    ...counts,
    diagramText:
      diagramTextPx.length === 0
        ? { kind: "absent" }
        : {
            kind: "at",
            count: diagramTextPx.length,
            smallest: Math.min(...diagramTextPx),
            belowSmall: diagramTextPx.filter((px) => px < SMALL_TEXT_PX).length,
          },
    hueFamilies: families,
    hueFamilyCount: families.length,
    verdict: verdictTop === undefined ? { kind: "absent" } : { kind: "at", top: verdictTop },
    firstFigure:
      figureTop === undefined
        ? { kind: "absent" }
        : { kind: "at", top: figureTop, inFirstScreen: figureTop < dom.readingHeight },
  }
}

/** `| 項目 | 値 |` の表の行。 */
export function formatPaperMetric(metric: PaperMetric): readonly string[] {
  const { bold, paragraphs } = metric.boldPerParagraph
  const stacked = metric.stackedBlocks
  const rows: readonly (readonly [string, string])[] = [
    ["左の色罫", String(metric.leftRules)],
    ["数の札の列", String(metric.statStrips)],
    ["番号の列", String(metric.numberedLists)],
    ["絵文字", String(metric.emoji)],
    [
      "太字（段落あたり）",
      paragraphs === 0
        ? "-"
        : `${String(bold)} / ${String(paragraphs)}段落 = ${(bold / paragraphs).toFixed(2)}`,
    ],
    ["色相の族", String(metric.hueFamilyCount)],
    [
      "色相の族の内訳",
      metric.hueFamilies.length === 0
        ? "-"
        : metric.hueFamilies
            .map(([degrees, pixels]) => `${String(degrees)}°: ${String(pixels)}px`)
            .join(" "),
    ],
    ["読む面の高さ", `${String(metric.readingHeight)}px`],
    ["結論の頭の高さ", metric.verdict.kind === "at" ? heightText(metric.verdict.top) : "-"],
    ["図1の上端", metric.firstFigure.kind === "at" ? heightText(metric.firstFigure.top) : "-"],
    [
      "図1が最初の1画面に入る",
      metric.firstFigure.kind === "at"
        ? metric.firstFigure.inFirstScreen
          ? "はい"
          : "いいえ"
        : "-",
    ],
    ["図の数", String(metric.figures)],
    ["読む面を超える図", String(metric.oversizedFigures)],
    [
      "読む面を超える図の割合",
      metric.figures === 0
        ? "-"
        : `${((metric.oversizedFigures / metric.figures) * 100).toFixed(1)}%`,
    ],
    [
      "svg の文字の最小 px",
      metric.diagramText.kind === "at" ? `${metric.diagramText.smallest.toFixed(1)}px` : "-",
    ],
    [
      `${String(SMALL_TEXT_PX)}px 未満の図`,
      metric.diagramText.kind === "at"
        ? `${String(metric.diagramText.belowSmall)} / ${String(metric.diagramText.count)}`
        : "-",
    ],
    ["縦落ち stats", stackedText(stacked.stats)],
    ["縦落ち compare", stackedText(stacked.compare)],
    ["縦落ち beforeAfter", stackedText(stacked.beforeAfter)],
    ["縦落ち options", stackedText(stacked.options)],
    ["縦落ち files", stackedText(stacked.files)],
  ]
  return [
    "| 項目 | 値 |",
    "| --- | --- |",
    ...rows.map(([item, value]) => `| ${item} | ${value} |`),
  ]
}

function heightText(value: number): string {
  return `${String(Math.round(value))}px`
}

function stackedText(count: StackedCount): string {
  return `${String(count.stacked)} / ${String(count.total)}`
}

/** 報告欄を撮った画素から、色相の族と画素数を度の昇順で返す。報告欄が複数あれば画素数を合算する。 */
async function hueFamiliesOfReport(page: Page): Promise<readonly (readonly [number, number])[]> {
  const locator = page.locator(DETAIL_BLOCK_SELECTOR)
  const total = new Map<number, number>()
  for (let index = 0; index < (await locator.count()); index++) {
    const png = decodePng(await locator.nth(index).screenshot())
    for (const [family, pixels] of hueFamilies(png)) {
      total.set(family, (total.get(family) ?? 0) + pixels)
    }
  }
  return [...total].toSorted(([a], [b]) => a - b)
}
