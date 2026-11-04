// 表（`table`）と対応表（`matrix`）の、全行から決まる値（列の揃え・数の棒・状態の列・凡例の並び・濃淡の段・合計）と、状態の印の表。
// Markdown に組む側と React の部品が、同じ決まりを読む。

import { sum } from "remeda"

import {
  type MatrixCell,
  REPORT_CELL_STATUSES,
  REPORT_MATRIX_STATUSES,
  type TableCell,
  tableRowCells,
} from "./report-block-comparison.ts"
import type { ReportBlock } from "./report-block.ts"

type TableBlock = Extract<ReportBlock, { readonly kind: "table" }>
type MatrixBlock = Extract<ReportBlock, { readonly kind: "matrix" }>

type CellStatus = Extract<TableCell, { readonly status: string }>["status"]
export type MatrixStatus = (typeof REPORT_MATRIX_STATUSES)[number]

/** 対応表のセルの状態と補足（補足の無いセルは空文字）。 */
export function matrixCellOf(cell: MatrixCell): {
  readonly status: MatrixStatus
  readonly note: string
} {
  return typeof cell === "string" ? { status: cell, note: "" } : cell
}

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

export function tableLayoutOf(table: Pick<TableBlock, "columns" | "rows" | "heat">): TableLayout {
  const rows = table.rows.map(tableRowCells)
  const heat = tableHeatOf(table)
  return {
    aligns: table.columns.map((_, index) => columnAlign(rows, index)),
    bars: table.columns.map((_, index) =>
      isHeatColumn(heat, index) ? NO_BAR : columnBar(rows, index),
    ),
    statusColumns: table.columns.map((_, index) =>
      rows.some((cells) => {
        const cell = cells[index]
        return cell !== undefined && isStatusCell(cell)
      }),
    ),
    legendStatuses: REPORT_CELL_STATUSES.filter((status) =>
      rows.some((cells) => cells.some((cell) => isStatusCell(cell) && cell.status === status)),
    ),
  }
}

/** 対応表の格子に出た状態。凡例の並びで、`REPORT_MATRIX_STATUSES` の順。 */
export function matrixLegendStatuses(block: Pick<MatrixBlock, "rows">): readonly MatrixStatus[] {
  return REPORT_MATRIX_STATUSES.filter((status) =>
    block.rows.some(({ cells }) => cells.some((cell) => matrixCellOf(cell).status === status)),
  )
}

/** 濃淡の段の数。段 0 がいちばん薄い。 */
const HEAT_LEVEL_COUNT = 6

export type TableHeat =
  | { readonly kind: "none" }
  | { readonly kind: "heat"; readonly from: number; readonly to: number; readonly max: number }

/** `heat` の範囲と、範囲の全行のセルの最大値。 */
export function tableHeatOf(table: Pick<TableBlock, "rows" | "heat">): TableHeat {
  const { heat } = table
  if (heat === undefined) {
    return { kind: "none" }
  }
  const magnitudes = table.rows.flatMap((row) =>
    heatRange(tableRowCells(row), heat).map(heatMagnitude),
  )
  return { kind: "heat", from: heat.from, to: heat.to, max: Math.max(0, ...magnitudes) }
}

export function isHeatColumn(heat: TableHeat, index: number): boolean {
  return heat.kind === "heat" && index >= heat.from && index <= heat.to
}

/** 濃淡を塗れるセル: 0 以上の素の数。 */
export function isHeatCell(cell: TableCell): cell is string {
  return typeof cell === "string" && NUMERIC_CELL_PATTERN.test(cell) && !cell.startsWith("-")
}

/** セルの濃淡の段（0 から `HEAT_LEVEL_COUNT - 1`）。最大値を `HEAT_LEVEL_COUNT` 等分した帯で決める。 */
export function heatLevelOf(
  heat: Extract<TableHeat, { readonly kind: "heat" }>,
  cell: TableCell,
): number {
  if (heat.max <= 0) {
    return 0
  }
  const level = Math.floor((heatMagnitude(cell) / heat.max) * HEAT_LEVEL_COUNT)
  return Math.min(HEAT_LEVEL_COUNT - 1, level)
}

/** 範囲の最大値と等しいセルか（同じ値が複数あれば全部）。最大値が 0 のときはどれも当たらない。 */
export function isHeatPeak(
  heat: Extract<TableHeat, { readonly kind: "heat" }>,
  cell: TableCell,
): boolean {
  return heat.max > 0 && heatMagnitude(cell) === heat.max
}

export type TableTotals =
  | { readonly kind: "none" }
  | {
      readonly kind: "totals"
      /** 行ごとの、`heat` の範囲のセルの合計。行の並びと同じ長さ。 */
      readonly rows: readonly string[]
      /** `heat` の範囲の列ごとの合計。範囲の左から。 */
      readonly columns: readonly string[]
      readonly grand: string
    }

/**
 * `totals` と `heat` があるときの合計。渡した行だけを足す。
 * 小数の桁はセルのいちばん長い桁に、桁区切りはセルに 1 つでもあれば付ける。
 */
export function tableTotalsOf(table: Pick<TableBlock, "rows" | "heat" | "totals">): TableTotals {
  const { heat } = table
  if (heat === undefined || table.totals !== true) {
    return { kind: "none" }
  }
  const grid = table.rows.map((row) => heatRange(tableRowCells(row), heat))
  const texts = grid.flat().filter(isHeatCell)
  const digits = Math.max(0, ...texts.map(fractionDigits))
  const format = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: texts.some((text) => text.includes(",")),
  })
  const rowSums = grid.map((cells) => sum(cells.map(heatMagnitude)))
  const columnSums = Array.from({ length: heat.to - heat.from + 1 }, (_, offset) =>
    sum(grid.map((cells) => heatMagnitude(cells[offset] ?? "0"))),
  )
  return {
    kind: "totals",
    rows: rowSums.map((value) => format.format(value)),
    columns: columnSums.map((value) => format.format(value)),
    grand: format.format(sum(rowSums)),
  }
}

type HeatRange = NonNullable<TableBlock["heat"]>

function heatRange(cells: readonly TableCell[], heat: HeatRange): readonly TableCell[] {
  return cells.slice(heat.from, heat.to + 1)
}

function heatMagnitude(cell: TableCell): number {
  return isHeatCell(cell) ? numericCellMagnitude(cell) : 0
}

function fractionDigits(text: string): number {
  return /\.(\d+)/.exec(text)?.[1]?.length ?? 0
}

function isStatusCell(cell: TableCell): cell is Extract<TableCell, { readonly status: string }> {
  return typeof cell !== "string" && "status" in cell
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
