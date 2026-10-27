// 行内の印を置ける場所（結論・`text` の塊・`list` の項目・`table` のセル）にある、書式に当たらない `{{` の数。数だけを持ち、本文の字は持たない。

import { brokenInlineMarkCount } from "../../../shared/report/inline-mark.ts"
import type { ReportBlock } from "../../../shared/report/report-block.ts"
import { drawnSectionsOf } from "../../../shared/report/report-retrospective.ts"
import { leafBlocksOf } from "../../../shared/report/row-panel-block.ts"
import { proseTexts } from "./report-prose-rule.ts"
import type { ReportDraft } from "./report-violation.ts"

type InlineMarkSource = Pick<ReportDraft, "conclusion" | "figure" | "sections" | "retrospective">

export function brokenInlineMarks(report: InlineMarkSource): number {
  const texts = [
    report.conclusion,
    ...drawnSectionsOf(report)
      .flatMap((section) => leafBlocksOf(section.blocks))
      .flatMap(markTexts),
  ]
  return texts.reduce((total, text) => total + brokenInlineMarkCount(text), 0)
}

function markTexts(block: ReportBlock): readonly string[] {
  return block.kind === "list"
    ? block.items.flatMap((item) => [item.label, item.text, item.source, item.branch])
    : proseTexts(block)
}
