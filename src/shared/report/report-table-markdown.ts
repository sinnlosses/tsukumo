// 表（`table`）の塊を Markdown と HTML に組む。

import { unique } from "remeda"

import {
  isEmphasisRow,
  type TableCell,
  tableRowCells,
  tableRowDepth,
  tableRowDetail,
} from "./report-block-comparison.ts"
import type { LeafComponent } from "./report-block.ts"
import { captionedMarkdown } from "./report-caption.ts"
import { htmlInlineWithCode, joinParts, markdownInline } from "./report-inline-markdown.ts"
import {
  CELL_STATUS_MARKS,
  type ColumnBar,
  numericCellMagnitude,
  tableLayoutOf,
} from "./table-layout.ts"
import { tableCellTexts } from "./table-view.ts"

/** 強調の行の先頭のセルに置く印。地の色は CSS が `tr:has()` で行に当てる。 */
const EMPHASIS_ROW_MARK = '<span class="row-emphasis-mark" aria-hidden="true"></span>'

const DEPTH_INDENT = "　"

const EMPHASIS_COLUMN_MARK = '<span class="column-emphasis-mark" aria-hidden="true"></span>'

const TAG_TONE_COUNT = 5
const TAG_TONE_NONE = "tag-none"

/** `tag` の字 → 札の色の class（`tag-1`〜`tag-5`、6 種目以降は `tag-none`）。 */
export type TagTones = ReadonlyMap<string, string>

/** レポート全体の表の `tag` の字を、出現順に色へ割り当てる（同じ字は表をまたいでも同じ色）。 */
export function tagTonesOf(blocks: readonly LeafComponent[]): TagTones {
  const tags = blocks
    .flatMap((block) => (block.kind === "table" ? block.rows.flatMap(tableRowCells) : []))
    .flatMap((cell) => (typeof cell === "object" && "tag" in cell ? [cell.tag] : []))
  return new Map(
    unique(tags).map((tag, index) => [
      tag,
      index < TAG_TONE_COUNT ? `tag-${String(index + 1)}` : TAG_TONE_NONE,
    ]),
  )
}

export function tableMarkdown(
  table: Extract<LeafComponent, { readonly kind: "table" }>,
  ordinal: number,
  tagTones: TagTones,
): string {
  const { aligns, legendStatuses } = tableLayoutOf(table)
  return captionedMarkdown({
    kind: "table",
    ordinal,
    title: table.title,
    body: joinParts([
      tableStatusLegendMarkdown(legendStatuses),
      [
        markdownRow(
          table.columns.map((column, index) =>
            columnMarked(cellMarkdown(column, NO_BAR, tagTones), index, table.emphasisColumn),
          ),
        ),
        markdownRow(aligns.map((align) => (align === "right" ? "---:" : "---"))),
        ...tableRowMarkdowns(table, tagTones),
      ].join("\n"),
      tableRowDetailsMarkdown(table),
      table.rest.trim() === ""
        ? ""
        : `<div class="table-rest">${htmlInlineWithCode(table.rest)}</div>`,
    ]),
    bodyFormat: "markdown",
    fit: true,
  })
}

/** 表のデータ行ごとの Markdown。並びは `table.rows` と同じ。 */
function tableRowMarkdowns(
  table: Extract<LeafComponent, { readonly kind: "table" }>,
  tagTones: TagTones,
): readonly string[] {
  const { bars, statusColumns } = tableLayoutOf(table)
  const bodyCellMarkdown = (cell: TableCell, index: number): string =>
    columnMarked(
      statusColumns[index] === true && typeof cell === "string"
        ? `<span class="cell-status-none">${cellTextMarkdown(cell)}</span>`
        : cellMarkdown(cell, bars[index] ?? NO_BAR, tagTones),
      index,
      table.emphasisColumn,
    )
  return table.rows.map((row) => {
    const cells = tableRowCells(row).map(bodyCellMarkdown)
    const [first = "", ...rest] = cells
    const indented = `${DEPTH_INDENT.repeat(tableRowDepth(row))}${first}`
    return markdownRow([isEmphasisRow(row) ? `${EMPHASIS_ROW_MARK}${indented}` : indented, ...rest])
  })
}

function tableRowDetailsMarkdown(
  table: Extract<LeafComponent, { readonly kind: "table" }>,
): string {
  return table.rows
    .flatMap((row) => {
      const detail = tableRowDetail(row)
      const name = tableCellTexts(tableRowCells(row)[0]).join(" ")
      return detail === undefined ? [] : [`- ${markdownInline(name)}: ${markdownInline(detail)}`]
    })
    .join("\n")
}

function columnMarked(cell: string, index: number, emphasisColumn: number | undefined): string {
  return index === emphasisColumn ? `${EMPHASIS_COLUMN_MARK}${cell}` : cell
}

/** 表に出た状態のセルの状態だけを、題と表のあいだの凡例に並べる。 */
function tableStatusLegendMarkdown(
  statuses: ReturnType<typeof tableLayoutOf>["legendStatuses"],
): string {
  if (statuses.length === 0) {
    return ""
  }
  const items = statuses
    .map((status) => {
      const { className, symbol, label } = CELL_STATUS_MARKS[status]
      return (
        `<span class="table-status-legend-item">` +
        `<span class="table-status-legend-swatch ${className}" aria-hidden="true"></span>` +
        `<span class="cell-status-mark ${className}" aria-hidden="true">${symbol}</span> ${label}</span>`
      )
    })
    .join("")
  return `<div class="table-status-legend">${items}</div>`
}

const NO_BAR: ColumnBar = { kind: "none" }

function cellMarkdown(cell: TableCell, bar: ColumnBar, tagTones: TagTones): string {
  if (typeof cell === "string") {
    return bar.kind === "bar" ? numericBarMarkdown(cell, bar.max) : cellTextMarkdown(cell)
  }
  if ("from" in cell) {
    return `<span class="change-from">${markdownInline(cell.from)} →</span> ${markdownInline(cell.to)}`.replaceAll(
      "|",
      "\\|",
    )
  }
  if ("tag" in cell) {
    const tone = tagTones.get(cell.tag) ?? TAG_TONE_NONE
    return `<span class="tag ${tone}">${markdownInline(cell.tag)}</span>`.replaceAll("|", "\\|")
  }
  const status = CELL_STATUS_MARKS[cell.status]
  const text = cell.text.trim()
  const mark = `<span class="cell-status-mark ${status.className}" role="img" aria-label="${status.label}">${status.symbol}</span>`
  const body = `${mark}<span class="cell-status-text">${markdownInline(text === "" ? status.label : text)}</span>`
  return `<span class="cell-status ${status.className}">${body}</span>`.replaceAll("|", "\\|")
}

function cellTextMarkdown(cell: string): string {
  return markdownInline(cell).replaceAll("|", "\\|")
}

/** 数だけの列のセルを、列の最大値に対する幅の棒と数字を重ねた印にする。 */
function numericBarMarkdown(cell: string, max: number): string {
  const width = Math.round((numericCellMagnitude(cell) / max) * 100)
  return `<span class="cell-numeric"><span class="cell-bar" style="width: ${String(width)}%"></span><span class="cell-numeric-value">${markdownInline(cell)}</span></span>`.replaceAll(
    "|",
    "\\|",
  )
}

function markdownRow(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`
}
