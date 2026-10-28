// 行内の印を置ける場所（結論・`text` の塊・`list` の項目・`table` のセル）にある、書式に当たらない `{{` の数。数だけを持ち、本文の字は持たない。

import { brokenInlineMarkCount } from "../../../shared/report/inline-mark.ts"
import {
  drawnLeaves,
  type ReportOutline,
  type ReportOutlineLeaf,
} from "../../../shared/report/report-outline.ts"
import { retrospectiveDraftsLine } from "../../../shared/report/report-retrospective.ts"
import { proseTexts } from "./report-prose-rule.ts"
import type { ReportDraft } from "./report-violation.ts"

type InlineMarkSource = Pick<ReportDraft, "conclusion" | "retrospective">

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
  const { retrospective } = report
  if (retrospective.kind === "none") {
    return []
  }
  return [
    retrospective.summary,
    ...(retrospective.drafts.length === 0 ? [] : [retrospectiveDraftsLine(retrospective.drafts)]),
  ]
}

function markTexts(leaf: ReportOutlineLeaf): readonly string[] {
  return leaf.component === "ItemList"
    ? leaf.items.flatMap((item) => [item.label, item.text, item.source, item.branch])
    : proseTexts(leaf)
}
