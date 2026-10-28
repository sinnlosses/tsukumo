// 表（`table`）と対応表（`matrix`）の塊を Markdown と HTML に組む。

import { unique } from "remeda"

import { isEmphasisRow, type TableCell, tableRowCells } from "./report-block-comparison.ts"
import type { ReportBlock, ReportSection } from "./report-block.ts"
import { captionedMarkdown } from "./report-caption.ts"
import { htmlInlineWithCode, joinParts, markdownInline } from "./report-inline-markdown.ts"
import { leafBlocksOf } from "./row-panel-block.ts"
import {
  CELL_STATUS_MARKS,
  type ColumnBar,
  MATRIX_MARKS,
  type MatrixStatus,
  matrixLegendStatuses,
  numericCellMagnitude,
  tableLayoutOf,
} from "./table-layout.ts"

/** 強調の行の先頭のセルに置く印。地の色は CSS が `tr:has()` で行に当てる。 */
const EMPHASIS_ROW_MARK = '<span class="row-emphasis-mark" aria-hidden="true"></span>'

const TAG_TONE_COUNT = 5
const TAG_TONE_NONE = "tag-none"

/** `tag` の字 → 札の色の class（`tag-1`〜`tag-5`、6 種目以降は `tag-none`）。 */
export type TagTones = ReadonlyMap<string, string>

/** レポート全体の表の `tag` の字を、出現順に色へ割り当てる（同じ字は表をまたいでも同じ色）。 */
export function tagTonesOf(sections: readonly ReportSection[]): TagTones {
  const tags = sections
    .flatMap((section) => leafBlocksOf(section.blocks))
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
  table: Extract<ReportBlock, { readonly kind: "table" }>,
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
        markdownRow(table.columns.map((column) => cellMarkdown(column, NO_BAR, tagTones))),
        markdownRow(aligns.map((align) => (align === "right" ? "---:" : "---"))),
        ...tableRowMarkdowns(table, tagTones),
      ].join("\n"),
      table.rest.trim() === ""
        ? ""
        : `<div class="table-rest">${htmlInlineWithCode(table.rest)}</div>`,
    ]),
    bodyFormat: "markdown",
    fit: true,
  })
}

type MatrixBlock = Extract<ReportBlock, { readonly kind: "matrix" }>

/**
 * 行の名前と列の名前だけを見出しにした格子。交点は状態の印だけで、凡例は格子に出た状態だけを添える。
 * 印の名前は表の見出しの読み上げが担うので、`aria-label` は状態の語だけにする。
 */
export function matrixMarkdown(block: MatrixBlock, ordinal: number): string {
  const grid = [
    markdownRow(["", ...block.columns.map(cellTextMarkdown)]),
    markdownRow(["---", ...block.columns.map(() => ":---:")]),
    ...block.rows.map(({ name, cells }) =>
      markdownRow([
        cellTextMarkdown(name),
        ...cells.map((status) => matrixMarkMarkdown(status, false)),
      ]),
    ),
  ].join("\n")
  const legend = matrixLegendStatuses(block)
    .map(
      (status) =>
        `<span class="matrix-legend-item">${matrixMarkMarkdown(status, true)} ${MATRIX_MARKS[status].label}</span>`,
    )
    .join("")
  return captionedMarkdown({
    kind: "table",
    ordinal,
    title: block.title,
    body: `<div class="matrix">\n\n${grid}\n\n<div class="matrix-legend">${legend}</div>\n\n</div>`,
    bodyFormat: "markdown",
    fit: true,
  })
}

/** 表のデータ行ごとの Markdown。並びは `table.rows` と同じ。 */
function tableRowMarkdowns(
  table: Extract<ReportBlock, { readonly kind: "table" }>,
  tagTones: TagTones,
): readonly string[] {
  const { bars, statusColumns } = tableLayoutOf(table)
  const bodyCellMarkdown = (cell: TableCell, index: number): string =>
    statusColumns[index] === true && typeof cell === "string"
      ? `<span class="cell-status-none">${cellTextMarkdown(cell)}</span>`
      : cellMarkdown(cell, bars[index] ?? NO_BAR, tagTones)
  return table.rows.map((row) => {
    const cells = tableRowCells(row).map(bodyCellMarkdown)
    const [first = "", ...rest] = cells
    return markdownRow(isEmphasisRow(row) ? [`${EMPHASIS_ROW_MARK}${first}`, ...rest] : cells)
  })
}

function matrixMarkMarkdown(status: MatrixStatus, legend: boolean): string {
  const { className, symbol, label } = MATRIX_MARKS[status]
  const attributes = legend ? 'aria-hidden="true"' : `role="img" aria-label="${label}"`
  return `<span class="matrix-mark ${className}" ${attributes}>${symbol}</span>`
}

/** 表に出た状態のセルの状態だけを、題と表のあいだの凡例に並べる（`matrix` の凡例と同じ考え方）。 */
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
