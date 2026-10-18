// 表（`table`）と対応表（`matrix`）の塊を Markdown と HTML に組む。列の揃え・数の棒・状態の印もここが持つ。

import { REPORT_CELL_STATUSES, REPORT_MATRIX_STATUSES } from "./report-block-comparison.ts"
import type { ReportBlock } from "./report-block.ts"
import { captionedMarkdown } from "./report-caption.ts"
import { htmlInlineWithCode, joinParts, markdownInline } from "./report-inline-markdown.ts"

/** 表のセルの状態 → 記号付きの印の class（記法の `cell-status-*`）・記号・書き手の文字に関わらず付ける語。 */
const CELL_STATUS_MARKS = {
  ok: { className: "cell-status-ok", symbol: "✓", label: "OK" },
  warn: { className: "cell-status-warn", symbol: "！", label: "要注意" },
  ng: { className: "cell-status-ng", symbol: "✕", label: "NG" },
} as const satisfies Record<
  Extract<ReportCell, { readonly status: string }>["status"],
  { readonly className: string; readonly symbol: string; readonly label: string }
>

/** 対応表の状態 → 印の class・記号・読み上げと凡例の語。 */
const MATRIX_MARKS = {
  ok: { className: "matrix-mark-ok", symbol: "✓", label: "OK" },
  warn: { className: "matrix-mark-warn", symbol: "！", label: "要注意" },
  ng: { className: "matrix-mark-ng", symbol: "✕", label: "NG" },
  na: { className: "matrix-mark-na", symbol: "－", label: "該当なし" },
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "matrix" }>["rows"][number]["cells"][number],
  { readonly className: string; readonly symbol: string; readonly label: string }
>

export function tableMarkdown(
  table: Extract<ReportBlock, { readonly kind: "table" }>,
  ordinal: number,
): string {
  const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`
  const aligns = table.columns.map((_, index) => columnAlign(table.rows, index))
  const bars = table.columns.map((_, index) => columnBar(table.rows, index))
  const statusColumns = table.columns.map((_, index) =>
    table.rows.some((cells) => isStatusCell(cells[index])),
  )
  const bodyCellMarkdown = (cell: ReportCell, index: number): string =>
    statusColumns[index] === true && typeof cell === "string"
      ? `<span class="cell-status-none">${cellTextMarkdown(cell)}</span>`
      : cellMarkdown(cell, bars[index] ?? NO_BAR)
  return captionedMarkdown({
    kind: "table",
    ordinal,
    title: table.title,
    body: joinParts([
      tableStatusLegendMarkdown(table),
      [
        row(table.columns.map((column) => cellMarkdown(column, NO_BAR))),
        row(aligns.map(alignMarker)),
        ...table.rows.map((cells) => row(cells.map(bodyCellMarkdown))),
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
type MatrixStatus = MatrixBlock["rows"][number]["cells"][number]

/**
 * 行の名前と列の名前だけを見出しにした格子。交点は状態の印だけで、凡例は格子に出た状態だけを添える。
 * 印の名前は表の見出しの読み上げが担うので、`aria-label` は状態の語だけにする。
 */
export function matrixMarkdown(block: MatrixBlock, ordinal: number): string {
  const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`
  const grid = [
    row(["", ...block.columns.map(cellTextMarkdown)]),
    row(["---", ...block.columns.map(() => ":---:")]),
    ...block.rows.map(({ name, cells }) =>
      row([cellTextMarkdown(name), ...cells.map((status) => matrixMarkMarkdown(status, false))]),
    ),
  ].join("\n")
  const present = REPORT_MATRIX_STATUSES.filter((status) =>
    block.rows.some(({ cells }) => cells.includes(status)),
  )
  const legend = present
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

/** `NUMERIC_CELL_PATTERN` に合う文字列を数値にする（桁区切りの `,` を除き、`%` は数値のまま読む）。 */
export function numericCellMagnitude(text: string): number {
  return Number.parseFloat(text.replaceAll(",", ""))
}

function matrixMarkMarkdown(status: MatrixStatus, legend: boolean): string {
  const { className, symbol, label } = MATRIX_MARKS[status]
  const attributes = legend ? 'aria-hidden="true"' : `role="img" aria-label="${label}"`
  return `<span class="matrix-mark ${className}" ${attributes}>${symbol}</span>`
}

/** 表に出た状態のセルの状態だけを、題と表のあいだの凡例に並べる（`matrix` の凡例と同じ考え方）。 */
function tableStatusLegendMarkdown(
  table: Extract<ReportBlock, { readonly kind: "table" }>,
): string {
  const present = REPORT_CELL_STATUSES.filter((status) =>
    table.rows.some((row) => row.some((cell) => isStatusCell(cell) && cell.status === status)),
  )
  if (present.length === 0) {
    return ""
  }
  const items = present
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

function isStatusCell(
  cell: ReportCell | undefined,
): cell is Extract<ReportCell, { readonly status: string }> {
  return cell !== undefined && typeof cell !== "string" && "status" in cell
}

type ColumnAlign = "left" | "right"

/** 見た目だけの数字（符号・桁区切り・小数点・末尾の % を許す）。単位付きの数字は左揃えのまま。 */
export const NUMERIC_CELL_PATTERN = /^-?\d[\d,]*(?:\.\d+)?%?$/

type ReportCell = Extract<ReportBlock, { readonly kind: "table" }>["rows"][number][number]

/** 列の全セルが数（前と後がどちらも数の変化を含む）なら右に揃える。それ以外は左。 */
function columnAlign(
  rows: Extract<ReportBlock, { readonly kind: "table" }>["rows"],
  index: number,
): ColumnAlign {
  const cells = rows.map((row) => row[index])
  if (cells.every((cell) => cell !== undefined && isNumericCell(cell))) {
    return "right"
  }
  return "left"
}

function isNumericCell(cell: ReportCell): boolean {
  if (typeof cell === "string") {
    return NUMERIC_CELL_PATTERN.test(cell)
  }
  return (
    "from" in cell && NUMERIC_CELL_PATTERN.test(cell.from) && NUMERIC_CELL_PATTERN.test(cell.to)
  )
}

/** GFM の列揃えの記法（`---:`）。 */
function alignMarker(align: ColumnAlign): string {
  switch (align) {
    case "left":
      return "---"
    case "right":
      return "---:"
  }
}

type ColumnBar = { readonly kind: "none" } | { readonly kind: "bar"; readonly max: number }

const NO_BAR: ColumnBar = { kind: "none" }

/**
 * 列の全セルが素の文字列で数（`from`/`to` の変化セルを含まない）・行が2つ以上・列に負の数が無い・
 * 最大値が0より大きいときだけ、行の値を最大値に照らす棒を描く。
 */
function columnBar(
  rows: Extract<ReportBlock, { readonly kind: "table" }>["rows"],
  index: number,
): ColumnBar {
  if (rows.length < 2 || columnAlign(rows, index) !== "right") {
    return NO_BAR
  }
  const cells = rows.map((row) => row[index])
  if (!cells.every((cell): cell is string => typeof cell === "string")) {
    return NO_BAR
  }
  const magnitudes = cells.map(numericCellMagnitude)
  const max = Math.max(...magnitudes)
  return magnitudes.some((magnitude) => magnitude < 0) || max <= 0 ? NO_BAR : { kind: "bar", max }
}

function cellMarkdown(cell: ReportCell, bar: ColumnBar): string {
  if (typeof cell === "string") {
    return bar.kind === "bar" ? numericBarMarkdown(cell, bar.max) : cellTextMarkdown(cell)
  }
  if ("from" in cell) {
    return `<span class="change-from">${markdownInline(cell.from)} →</span> ${markdownInline(cell.to)}`.replaceAll(
      "|",
      "\\|",
    )
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
