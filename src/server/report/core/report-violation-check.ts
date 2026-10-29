// `report` ツールで受け取ったレポートの検査（「検査 → 整形 → 描画」の検査の段）。
//
// 検査するのは「レポートの記法」（`REPORT_NOTATION_PROMPT`）の条のうち、機械で判定できるものだけ。
// 読み手によって結論が変わる条（効能書き・根拠の量・前置きと締めの行など）は入れない。
// 誤って差し戻すと、直しようのない指摘でモデルを1往復させることになる。
//
// 本文は節と塊の並びで届くので、塊の種類ごとに数える。

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import { markFitsLines, sourceLineCount } from "../../../shared/report/code-mark.ts"
import { isEmphasisRow } from "../../../shared/report/report-block-comparison.ts"
import {
  MAX_EMPHASIS_ROWS,
  MAX_FIRST_SENTENCE,
  MAX_LIST_ITEMS,
  MAX_PLAIN_CODE_LINES,
  MAX_TABLE_ROWS,
} from "../../../shared/report/report-limit.ts"
import {
  drawnLeaves,
  type ReportOutline,
  type ReportOutlineLeaf,
  reportFigureOf,
  reportOutline,
  sectionLeaves,
  timelinesOfLeaves,
} from "../../../shared/report/report-outline.ts"
import { codeBlockMatchesFile } from "./code-block-match.ts"
import { figureNumberFaults } from "./figure-number-fault.ts"
import { brokenInlineMarks } from "./inline-mark-fault.ts"
import { plainWordSpellingsIn } from "./plain-word-find.ts"
import { plotFormFaults } from "./plot-form-fault.ts"
import { plotNoteFaults } from "./plot-note-fault.ts"
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
  nestedFoldCount,
  noteCount,
} from "./report-block-rule.ts"
import {
  graphFaultsInLeaves,
  graphToneFaultsInLeaves,
  svgFaultsInLeaves,
  svgToneFaultsInLeaves,
  unknownMermaidCount,
} from "./report-figure-fault.ts"
import { notationsInSections } from "./report-markdown-notation.ts"
import {
  hasArrow,
  isBadHeading,
  isLabeledOrdered,
  isNonJapanese,
  labelInItemCount,
  proseTexts,
} from "./report-prose-rule.ts"
import { type ReportDraft, type ReportViolation, VIOLATION_THRESHOLDS } from "./report-violation.ts"
import { templateMissesOf } from "./template-miss-fault.ts"
import { timelineFaults } from "./timeline-fault.ts"

/** レポートの規約違反を並べる。空なら違反は無い。 */
export function reportViolations(report: ReportDraft): readonly ReportViolation[] {
  const outline = reportOutline(report.components)
  const leaves = sectionLeaves(outline)
  const notations = notationsInSections(outline)
  const badCards = badCardsIn(leaves)
  const mismatchedCodeBlocks = leaves
    .filter(
      (leaf): leaf is Extract<ReportOutlineLeaf, { readonly component: "Code" }> =>
        leaf.component === "Code" && leaf.path.trim() !== "",
    )
    .filter((leaf) => {
      const content = report.fileContents.get(leaf.path)
      return content !== undefined && !codeBlockMatchesFile(leaf, content)
    })
  const firstSentenceLength = report.conclusionSentenceChars[0] ?? 0

  const drawn = drawnLeaves(outline)
  const svgFaults = svgFaultsInLeaves(drawn)
  const svgToneFaults = svgToneFaultsInLeaves(drawn)
  const graphFaults = graphFaultsInLeaves(drawn)
  const graphToneFaults = graphToneFaultsInLeaves(drawn)
  const timelineFaultList = timelineFaults(timelinesOfLeaves(drawn))

  const plainWords = plainWordSpellingsIn(report, outline)
  const figureNumberFaultList = figureNumberFaults(report, outline)
  const templateMissList = templateMissesOf(report)
  const plotForms = plotFormFaults(outline)

  const counted = [
    { kind: "long-conclusion", count: report.conclusionSentenceChars.length },
    { kind: "unknown-mermaid", count: unknownMermaidCount(drawn) },
    { kind: "too-many-notes", count: noteCount(outline) },
    { kind: "crowded-notes", count: crowdedNoteCount(outline) },
    { kind: "nested-fold", count: nestedFoldCount(outline) },
    {
      kind: "unordered-options",
      count: leaves.filter((leaf) => leaf.component === "Options" && !isVerdictOrdered(leaf))
        .length,
    },
    { kind: "ragged-table", count: leaves.filter((leaf) => isRaggedTable(leaf)).length },
    {
      kind: "long-table",
      count: leaves.filter(
        (leaf) =>
          leaf.component === "Table" &&
          leaf.rows.length > MAX_TABLE_ROWS &&
          leaf.rest.trim() === "",
      ).length,
    },
    {
      kind: "many-emphasis-rows",
      count: leaves.filter(
        (leaf) =>
          leaf.component === "Table" && leaf.rows.filter(isEmphasisRow).length > MAX_EMPHASIS_ROWS,
      ).length,
    },
    { kind: "sentence-table", count: leaves.filter((leaf) => isSentenceTable(leaf)).length },
    {
      kind: "long-list",
      count: leaves.filter(
        (leaf) => leaf.component === "ItemList" && leaf.items.length > MAX_LIST_ITEMS,
      ).length,
    },
    { kind: "bad-cards", count: badCards.length, faults: badCards },
    {
      kind: "long-code",
      count: leaves.filter(
        (leaf) =>
          leaf.component === "Code" &&
          leaf.marks.length === 0 &&
          sourceLineCount(leaf.source) > MAX_PLAIN_CODE_LINES,
      ).length,
    },
    { kind: "ragged-chart", count: drawn.filter((leaf) => isRaggedChart(leaf)).length },
    {
      kind: "unknown-emphasis",
      count: drawn.filter((leaf) => hasUnknownEmphasis(leaf)).length,
    },
    { kind: "short-series", count: drawn.filter((leaf) => hasShortSeries(leaf)).length },
    {
      kind: "untitled-section",
      count:
        outline.sections.length < 2
          ? 0
          : outline.sections.filter(
              (section) => section.kind === "loose" || section.heading.trim() === "",
            ).length,
    },
    { kind: "markdown-notation", count: notations.length, notations },
    { kind: "broken-svg", count: svgFaults.length, faults: svgFaults },
    { kind: "unlegended-svg-tone", count: svgToneFaults.length, faults: svgToneFaults },
    { kind: "unlegended-graph-tone", count: graphToneFaults.length, faults: graphToneFaults },
    { kind: "broken-graph", count: graphFaults.length, faults: graphFaults },
    { kind: "broken-timeline", count: timelineFaultList.length, faults: timelineFaultList },
    {
      kind: "code-mismatch",
      count: mismatchedCodeBlocks.length,
      paths: [...new Set(mismatchedCodeBlocks.map((leaf) => leaf.path))],
    },
    {
      kind: "code-marks-range",
      count: leaves.filter(
        (leaf) =>
          leaf.component === "Code" &&
          leaf.marks.some((mark) => !markFitsLines(mark, sourceLineCount(leaf.source))),
      ).length,
    },
    { kind: "region-range", count: drawn.filter((leaf) => hasBadRegion(leaf)).length },
    {
      kind: "long-first-sentence",
      count: firstSentenceLength > MAX_FIRST_SENTENCE ? 1 : 0,
      length: firstSentenceLength,
    },
    {
      kind: "bad-heading",
      count: outline.sections.filter(
        (section) => section.kind === "section" && isBadHeading(section.heading),
      ).length,
    },
    {
      kind: "unobserved-without-how",
      count: report.checks.filter(
        (check) => check.status === "unobserved" && check.howToVerify.trim() === "",
      ).length,
    },
    {
      kind: "arrow-in-prose",
      count: leaves.filter((leaf) => proseTexts(leaf).some(hasArrow)).length,
    },
    {
      kind: "label-in-item",
      count: leaves.reduce((total, leaf) => total + labelInItemCount(leaf), 0),
    },
    {
      kind: "labeled-ordered",
      count: leaves.filter((leaf) => isLabeledOrdered(leaf)).length,
    },
    {
      kind: "non-japanese",
      count: leaves.filter((leaf) => leaf.component === "Paragraph" && isNonJapanese(leaf.text))
        .length,
    },
    { kind: "plain-word", count: plainWords.length, spellings: plainWords },
    figureContradiction(report.components, outline),
    {
      kind: "figure-number-mismatch",
      count: figureNumberFaultList.length,
      faults: figureNumberFaultList,
    },
    { kind: "plot-forbidden-form", count: plotForms.refused.length, rules: plotForms.refused },
    { kind: "plot-form-override", count: plotForms.overrides },
    { kind: "broken-inline-mark", count: brokenInlineMarks(report, outline) },
    { kind: "plot-title-without-number", count: plotNoteFaults(outline) },
    { kind: "template-miss", count: templateMissList.length, misses: templateMissList },
  ] as const satisfies readonly ReportViolation[]

  return counted.filter((violation) => violation.count > VIOLATION_THRESHOLDS[violation.kind])
}

function figureContradiction(
  components: readonly A2uiReportComponent[],
  outline: ReportOutline,
): Extract<ReportViolation, { readonly kind: "figure-contradiction" }> {
  const figure = reportFigureOf(components)
  if (figure.kind === "none" && figure.reason === "no-shape") {
    return {
      kind: "figure-contradiction",
      count: sectionLeaves(outline).filter((leaf) => drawsShape(leaf)).length,
      reason: "no-shape",
    }
  }
  if (figure.kind === "none" && figure.reason === "short-answer") {
    return {
      kind: "figure-contradiction",
      count: outline.sections.length >= 2 ? outline.sections.length : 0,
      reason: "short-answer",
    }
  }
  return { kind: "figure-contradiction", count: 0, reason: "no-shape" }
}
