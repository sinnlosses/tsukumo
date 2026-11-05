// 使われ方の記録が、内容部品の書いた文から数える2つの値（出典の有無・強調の数）。
// 数えるのは有無と数だけで、文そのものは持ち出さない。

import { tableRowCells } from "../../../../shared/report/report-block-comparison.ts"
import type { ReportOutlineLeaf } from "../../../../shared/report/report-outline.ts"

const SOURCE_REFERENCE = /https?:\/\/\S|[\w./-]+\.\w+:\d+/

export function hasSourceReference(leaf: ReportOutlineLeaf): boolean {
  return leaf.component === "Code"
    ? leaf.path.trim() !== ""
    : writtenTextsOf(leaf).some((text) => SOURCE_REFERENCE.test(text))
}

export function emphasisCountOf(leaf: ReportOutlineLeaf): number {
  switch (leaf.component) {
    case "Paragraph":
      return emphasisCountIn(leaf.text)
    case "ItemList":
      return leaf.items.reduce(
        (total, item) => total + emphasisCountIn(item.text) + emphasisCountIn(item.branch),
        0,
      )
    case "Table":
      return leaf.rows.reduce(
        (total, row) =>
          total +
          tableRowCells(row).reduce(
            (rowTotal, cell) =>
              rowTotal +
              (typeof cell === "string"
                ? emphasisCountIn(cell)
                : "from" in cell
                  ? emphasisCountIn(cell.from) + emphasisCountIn(cell.to)
                  : "tag" in cell
                    ? emphasisCountIn(cell.tag)
                    : emphasisCountIn(cell.text)),
            0,
          ),
        0,
      )
    default:
      return 0
  }
}

function writtenTextsOf(leaf: ReportOutlineLeaf): readonly string[] {
  switch (leaf.component) {
    case "Paragraph":
    case "Note":
      return [leaf.text]
    case "ItemList":
      return leaf.items.map((item) => item.text)
    case "Table":
      return leaf.rows.flatMap((row) =>
        tableRowCells(row).flatMap((cell) =>
          typeof cell === "string"
            ? [cell]
            : "from" in cell
              ? [cell.from, cell.to]
              : "tag" in cell
                ? [cell.tag]
                : [cell.text],
        ),
      )
    case "Markdown":
      return [leaf.markdown]
    default:
      return []
  }
}

const INLINE_CODE = /(`+)[\s\S]*?\1/g

const EMPHASIS_PAIR = /\*\*[\s\S]+?\*\*/g

function emphasisCountIn(text: string): number {
  return text.replace(INLINE_CODE, "").match(EMPHASIS_PAIR)?.length ?? 0
}
