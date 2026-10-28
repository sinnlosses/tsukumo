// 表（`table`）と対応表（`matrix`）の、全行から決まる値（列の揃え・数の棒・状態の列・凡例の並び）と、状態の印の表。
// Markdown に組む側と React の部品が、同じ決まりを読む。

import {
  REPORT_CELL_STATUSES,
  REPORT_MATRIX_STATUSES,
  type TableCell,
  tableRowCells,
} from "./report-block-comparison.ts"
import type { ReportBlock } from "./report-block.ts"

type TableBlock = Extract<ReportBlock, { readonly kind: "table" }>
type MatrixBlock = Extract<ReportBlock, { readonly kind: "matrix" }>

type CellStatus = Extract<TableCell, { readonly status: string }>["status"]
export type MatrixStatus = MatrixBlock["rows"][number]["cells"][number]

type StatusMark = {
  readonly className: string
  readonly symbol: string
  readonly label: string
}

/** 表のセルの状態 → 記号付きの印の class（記法の `cell-status-*`）・記号・書き手の文字に関わらず付ける語。 */
export const CELL_STATUS_MARKS = {
  ok: { className: "cell-status-ok", symbol: "✓", label: "OK" },
  warn: { className: "cell-status-warn", symbol: "！", label: "要注意" },
  ng: { className: "cell-status-ng", symbol: "✕", label: "NG" },
} as const satisfies Record<CellStatus, StatusMark>

/** 対応表の状態 → 印の class・記号・読み上げと凡例の語。 */
export const MATRIX_MARKS = {
  ok: { className: "matrix-mark-ok", symbol: "✓", label: "OK" },
  warn: { className: "matrix-mark-warn", symbol: "！", label: "要注意" },
  ng: { className: "matrix-mark-ng", symbol: "✕", label: "NG" },
  na: { className: "matrix-mark-na", symbol: "－", label: "該当なし" },
} as const satisfies Record<MatrixStatus, StatusMark>

/** 見た目だけの数字（符号・桁区切り・小数点・末尾の % を許す）。単位付きの数字は左揃えのまま。 */
export const NUMERIC_CELL_PATTERN = /^-?\d[\d,]*(?:\.\d+)?%?$/

/** `NUMERIC_CELL_PATTERN` に合う文字列を数値にする（桁区切りの `,` を除き、`%` は数値のまま読む）。 */
export function numericCellMagnitude(text: string): number {
  return Number.parseFloat(text.replaceAll(",", ""))
}

export type ColumnAlign = "left" | "right"

export type ColumnBar = { readonly kind: "none" } | { readonly kind: "bar"; readonly max: number }

const NO_BAR: ColumnBar = { kind: "none" }

/** 表の全行から決まる値。配列は列の並びと同じ長さ。 */
type TableLayout = {
  readonly aligns: readonly ColumnAlign[]
  readonly bars: readonly ColumnBar[]
  /** その列に状態のセルが 1 つでもあるか。ある列の素の字は状態の無いセルとして包む。 */
  readonly statusColumns: readonly boolean[]
  /** 表に出た状態。凡例の並びで、`REPORT_CELL_STATUSES` の順。 */
  readonly legendStatuses: readonly CellStatus[]
}

export function tableLayoutOf(table: Pick<TableBlock, "columns" | "rows">): TableLayout {
  const rows = table.rows.map(tableRowCells)
  return {
    aligns: table.columns.map((_, index) => columnAlign(rows, index)),
    bars: table.columns.map((_, index) => columnBar(rows, index)),
    statusColumns: table.columns.map((_, index) =>
      rows.some((cells) => isStatusCell(cells[index])),
    ),
    legendStatuses: REPORT_CELL_STATUSES.filter((status) =>
      rows.some((cells) => cells.some((cell) => isStatusCell(cell) && cell.status === status)),
    ),
  }
}

/** 対応表の格子に出た状態。凡例の並びで、`REPORT_MATRIX_STATUSES` の順。 */
export function matrixLegendStatuses(block: Pick<MatrixBlock, "rows">): readonly MatrixStatus[] {
  return REPORT_MATRIX_STATUSES.filter((status) =>
    block.rows.some(({ cells }) => cells.includes(status)),
  )
}

function isStatusCell(
  cell: TableCell | undefined,
): cell is Extract<TableCell, { readonly status: string }> {
  return cell !== undefined && typeof cell !== "string" && "status" in cell
}

type CellRows = readonly (readonly TableCell[])[]

/** 列の全セルが数（前と後がどちらも数の変化を含む）なら右に揃える。それ以外は左。 */
function columnAlign(rows: CellRows, index: number): ColumnAlign {
  const cells = rows.map((row) => row[index])
  if (cells.every((cell) => cell !== undefined && isNumericCell(cell))) {
    return "right"
  }
  return "left"
}

function isNumericCell(cell: TableCell): boolean {
  if (typeof cell === "string") {
    return NUMERIC_CELL_PATTERN.test(cell)
  }
  return (
    "from" in cell && NUMERIC_CELL_PATTERN.test(cell.from) && NUMERIC_CELL_PATTERN.test(cell.to)
  )
}

/**
 * 列の全セルが素の文字列で数（`from`/`to` の変化セルを含まない）・行が2つ以上・列に負の数が無い・
 * 最大値が0より大きいときだけ、行の値を最大値に照らす棒を描く。
 */
function columnBar(rows: CellRows, index: number): ColumnBar {
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
