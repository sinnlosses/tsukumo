// 行内の印を置ける場所（結論・`text` の塊・`list` の項目・`table` のセル）にある、書式に当たらない `{{` の数。数だけを持ち、本文の字は持たない。

import { brokenInlineMarkCount } from "../../../shared/report/inline-mark.ts"
import {
  drawnLeaves,
  type ReportOutline,
  type ReportOutlineLeaf,
  reportRetrospectiveHeadOf,
} from "../../../shared/report/report-outline.ts"
import { retrospectiveDraftsLine } from "../../../shared/report/report-retrospective.ts"
import { proseTexts } from "./report-prose-rule.ts"
import type { ReportDraft } from "./report-violation.ts"

type InlineMarkSource = Pick<ReportDraft, "conclusion" | "components">

export function brokenInlineMarks(report: InlineMarkSource, outline: ReportOutline): number {
  const texts = [
    report.conclusion,
    ...retrospectiveHeadTexts(report),
    ...drawnLeaves(outline).flatMap(markTexts),
  ]
  return texts.reduce((total, text) => total + brokenInlineMarkCount(text), 0)
}

/** 振り返りの要約とドラフトの行。塊（`outline.retrospective`）は葉として別に読む。 */
function retrospectiveHeadTexts(report: InlineMarkSource): readonly string[] {
  const { summary, drafts } = reportRetrospectiveHeadOf(report.components)
  return [summary, ...(drafts.length === 0 ? [] : [retrospectiveDraftsLine(drafts)])]
}

function markTexts(leaf: ReportOutlineLeaf): readonly string[] {
  return leaf.component === "ItemList"
    ? leaf.items.flatMap((item) => [item.label, item.text, item.source, item.branch])
    : proseTexts(leaf)
}
