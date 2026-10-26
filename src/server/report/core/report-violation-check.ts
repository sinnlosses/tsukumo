// `report` ツールで受け取ったレポートの検査（「検査 → 整形 → 描画」の検査の段）。
//
// 検査するのは「レポートの記法」（`REPORT_NOTATION_PROMPT`）の条のうち、機械で判定できるものだけ。
// 読み手によって結論が変わる条（効能書き・根拠の量・前置きと締めの行など）は入れない。
// 誤って差し戻すと、直しようのない指摘でモデルを1往復させることになる。
//
// 本文は節と塊の並びで届くので、塊の種類ごとに数える。

import { markFitsLines, sourceLineCount } from "../../../shared/report/code-mark.ts"
import { isEmphasisRow } from "../../../shared/report/report-block-comparison.ts"
import type {
  RecordedReportFigure,
  ReportBlock,
  ReportSection,
} from "../../../shared/report/report-block.ts"
import type { ReportCheck } from "../../../shared/report/report-check.ts"
import {
  MAX_EMPHASIS_ROWS,
  MAX_FIRST_SENTENCE,
  MAX_LIST_ITEMS,
  MAX_PLAIN_CODE_LINES,
  MAX_TABLE_ROWS,
} from "../../../shared/report/report-limit.ts"
import { drawnSectionsOf } from "../../../shared/report/report-retrospective.ts"
import { codeBlockMatchesFile } from "./code-block-match.ts"
import {
  badCardsIn,
  crowdedNoteCount,
  drawsShape,
  hasBadRegion,
  hasShortSeries,
  hasUnknownEmphasis,
  isRaggedChart,
  isRaggedTable,
  isSentenceTable,
  isVerdictOrdered,
} from "./report-block-rule.ts"
import {
  graphFaultsInSections,
  graphToneFaultsInSections,
  svgFaultsInSections,
  svgToneFaultsInSections,
  unknownMermaidCount,
} from "./report-figure-fault.ts"
import { hasNestedFold, notationsInSections } from "./report-markdown-notation.ts"
import {
  hasArrow,
  isBadHeading,
  isLabeledOrdered,
  isNonJapanese,
  labelInItemCount,
  proseTexts,
} from "./report-prose-rule.ts"
import { type ReportDraft, type ReportViolation, VIOLATION_THRESHOLDS } from "./report-violation.ts"
import { timelineFaults } from "./timeline-fault.ts"

/** レポートの規約違反を並べる。空なら違反は無い。 */
export function reportViolations(report: ReportDraft): readonly ReportViolation[] {
  const blocks = report.sections.flatMap((section) => section.blocks)
  const notations = notationsInSections(report.sections)
  const badCards = badCardsIn(blocks)
  const mismatchedCodeBlocks = blocks
    .filter(
      (block): block is Extract<ReportBlock, { readonly kind: "code" }> =>
        block.kind === "code" && block.path.trim() !== "",
    )
    .filter((block) => {
      const content = report.fileContents.get(block.path)
      return content !== undefined && !codeBlockMatchesFile(block, content)
    })
  const firstSentenceLength = report.conclusionSentenceChars[0] ?? 0

  const drawnSections = drawnSectionsOf(report)
  const drawnBlocks = drawnSections.flatMap((section) => section.blocks)
  const svgFaults = svgFaultsInSections(drawnSections)
  const svgToneFaults = svgToneFaultsInSections(drawnSections)
  const graphFaults = graphFaultsInSections(drawnSections)
  const graphToneFaults = graphToneFaultsInSections(drawnSections)
  const timelineFaultList = timelineFaults(drawnBlocks.filter((block) => block.kind === "timeline"))

  const counted = [
    { kind: "long-conclusion", count: report.conclusionSentenceChars.length },
    { kind: "unknown-mermaid", count: unknownMermaidCount(drawnSections) },
    { kind: "too-many-notes", count: blocks.filter((block) => block.kind === "note").length },
    { kind: "crowded-notes", count: crowdedNoteCount(report.sections) },
    {
      kind: "nested-fold",
      count: blocks.filter((block) => block.kind === "markdown" && hasNestedFold(block)).length,
    },
    {
      kind: "unordered-options",
      count: blocks.filter((block) => block.kind === "options" && !isVerdictOrdered(block)).length,
    },
    { kind: "ragged-table", count: blocks.filter((block) => isRaggedTable(block)).length },
    {
      kind: "long-table",
      count: blocks.filter(
        (block) =>
          block.kind === "table" && block.rows.length > MAX_TABLE_ROWS && block.rest.trim() === "",
      ).length,
    },
    {
      kind: "many-emphasis-rows",
      count: blocks.filter(
        (block) =>
          block.kind === "table" && block.rows.filter(isEmphasisRow).length > MAX_EMPHASIS_ROWS,
      ).length,
    },
    { kind: "sentence-table", count: blocks.filter((block) => isSentenceTable(block)).length },
    {
      kind: "long-list",
      count: blocks.filter((block) => block.kind === "list" && block.items.length > MAX_LIST_ITEMS)
        .length,
    },
    { kind: "bad-cards", count: badCards.length, faults: badCards },
    {
      kind: "long-code",
      count: blocks.filter(
        (block) =>
          block.kind === "code" &&
          block.marks.length === 0 &&
          sourceLineCount(block.source) > MAX_PLAIN_CODE_LINES,
      ).length,
    },
    { kind: "ragged-chart", count: drawnBlocks.filter((block) => isRaggedChart(block)).length },
    {
      kind: "unknown-emphasis",
      count: drawnBlocks.filter((block) => hasUnknownEmphasis(block)).length,
    },
    { kind: "short-series", count: drawnBlocks.filter((block) => hasShortSeries(block)).length },
    {
      kind: "untitled-section",
      count:
        report.sections.length < 2
          ? 0
          : report.sections.filter((section) => section.heading.trim() === "").length,
    },
    { kind: "markdown-notation", count: notations.length, notations },
    {
      kind: "broken-mermaid",
      count: report.mermaidFaults.length,
      faults: report.mermaidFaults,
    },
    { kind: "broken-svg", count: svgFaults.length, faults: svgFaults },
    { kind: "unlegended-svg-tone", count: svgToneFaults.length, faults: svgToneFaults },
    { kind: "unlegended-graph-tone", count: graphToneFaults.length, faults: graphToneFaults },
    { kind: "broken-graph", count: graphFaults.length, faults: graphFaults },
    { kind: "broken-timeline", count: timelineFaultList.length, faults: timelineFaultList },
    {
      kind: "code-mismatch",
      count: mismatchedCodeBlocks.length,
      paths: [...new Set(mismatchedCodeBlocks.map((block) => block.path))],
    },
    {
      kind: "code-marks-range",
      count: blocks.filter(
        (block) =>
          block.kind === "code" &&
          block.marks.some((mark) => !markFitsLines(mark, sourceLineCount(block.source))),
      ).length,
    },
    { kind: "region-range", count: drawnBlocks.filter((block) => hasBadRegion(block)).length },
    {
      kind: "long-first-sentence",
      count: firstSentenceLength > MAX_FIRST_SENTENCE ? 1 : 0,
      length: firstSentenceLength,
    },
    {
      kind: "bad-heading",
      count: report.sections.filter(({ heading }) => isBadHeading(heading)).length,
    },
    {
      kind: "unobserved-without-how",
      count: report.checks.filter(
        (check) => check.status === "unobserved" && check.howToVerify.trim() === "",
      ).length,
    },
    {
      kind: "arrow-in-prose",
      count: blocks.filter((block) => proseTexts(block).some(hasArrow)).length,
    },
    {
      kind: "label-in-item",
      count: blocks.reduce((total, block) => total + labelInItemCount(block), 0),
    },
    {
      kind: "labeled-ordered",
      count: blocks.filter((block) => isLabeledOrdered(block)).length,
    },
    {
      kind: "non-japanese",
      count: blocks.filter((block) => block.kind === "text" && isNonJapanese(block.text)).length,
    },
    browserChangeWithoutImage(blocks, drawnBlocks, report.checks),
    figureContradiction(report.figure, report.sections),
  ] as const satisfies readonly ReportViolation[]

  return counted.filter((violation) => violation.count > VIOLATION_THRESHOLDS[violation.kind])
}

function browserChangeWithoutImage(
  blocks: readonly ReportBlock[],
  drawnBlocks: readonly ReportBlock[],
  checks: readonly ReportCheck[],
): Extract<ReportViolation, { readonly kind: "browser-change-without-image" }> {
  const changesBrowserFile = blocks.some(
    (block) =>
      block.kind === "files" &&
      block.items.some(
        (item) =>
          (item.change === "added" || item.change === "modified") && isBrowserComponent(item.path),
      ),
  )
  const hasImage = drawnBlocks.some(
    (block) =>
      block.kind === "image" ||
      (block.kind === "beforeAfter" &&
        [block.before, block.after].some((side) => side.kind === "image")),
  )
  const hasUnconfirmed = checks.some(
    (check) => check.status === "unobserved" || check.status === "blocked",
  )
  return {
    kind: "browser-change-without-image",
    count: changesBrowserFile && !hasImage && !hasUnconfirmed ? 1 : 0,
  }
}

function isBrowserComponent(path: string): boolean {
  return path.startsWith("src/browser/") && (path.endsWith(".tsx") || path.endsWith(".css"))
}

function figureContradiction(
  figure: RecordedReportFigure,
  sections: readonly ReportSection[],
): Extract<ReportViolation, { readonly kind: "figure-contradiction" }> {
  const blocks = sections.flatMap((section) => section.blocks)
  if (figure.kind === "none" && figure.reason === "no-shape") {
    return {
      kind: "figure-contradiction",
      count: blocks.filter((block) => drawsShape(block)).length,
      reason: "no-shape",
    }
  }
  if (figure.kind === "none" && figure.reason === "short-answer") {
    return {
      kind: "figure-contradiction",
      count: sections.length >= 2 ? sections.length : 0,
      reason: "short-answer",
    }
  }
  return { kind: "figure-contradiction", count: 0, reason: "no-shape" }
}
