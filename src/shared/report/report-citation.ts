// 本文の印 `{{cite: …}}` を置ける欄の読み方と、根の `sources`（出典の一覧）の読み出し。

import { unique } from "remeda"

import type { A2uiReportComponent } from "./a2ui-report-catalog.ts"
import { parseInlineMarks } from "./inline-mark.ts"
import { tableRowTexts } from "./report-block-comparison.ts"
import type { ReportOutlineLeaf } from "./report-outline.ts"
import type { ReportSource } from "./report-source.ts"

/** 根の `Report` の `sources`。無ければ空。 */
export function reportSourcesOf(
  components: readonly A2uiReportComponent[],
): readonly ReportSource[] {
  return components.find((part) => part.component === "Report")?.sources ?? []
}

/** 内容部品のうち `cite` を置ける欄の文字を、欄の順に並べる。置けない部品は空。 */
export function citableTexts(leaf: ReportOutlineLeaf): readonly string[] {
  switch (leaf.component) {
    case "Paragraph":
      return [leaf.text]
    case "Table":
      return leaf.rows.flatMap(tableRowTexts)
    case "ItemList":
      return leaf.items.map((item) => item.text)
    case "Claims":
      return leaf.items.flatMap((item) => [item.claim, item.basis])
    default:
      return []
  }
}

/** 描く順に並べた内容部品の置ける欄から、`cite` の id を初出の順に重複なく返す。 */
export function citedSourceIds(leaves: readonly ReportOutlineLeaf[]): readonly string[] {
  return unique(leaves.flatMap(citableTexts).flatMap(citeIdsOf))
}

/** 文字の中の `cite` の印の数。 */
export function citeCount(text: string): number {
  return parseInlineMarks(text).filter(
    (segment) => segment.kind === "mark" && segment.mark.kind === "cite",
  ).length
}

/** 文字の中の `cite` の id を出た順に（重複も含めて）返す。 */
function citeIdsOf(text: string): readonly string[] {
  return parseInlineMarks(text).flatMap((segment) =>
    segment.kind === "mark" && segment.mark.kind === "cite" ? segment.mark.ids : [],
  )
}
