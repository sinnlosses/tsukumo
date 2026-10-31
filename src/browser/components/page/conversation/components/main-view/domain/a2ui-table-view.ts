// 操作できる `Table`（`sortable`・`filterable`）の、並べ替えと絞り込みの判定。

import type { A2uiReportPart } from "../../../../../../../shared/report/a2ui-report-outline.ts"
import {
  type TableCell as Cell,
  tableRowCells,
} from "../../../../../../../shared/report/report-block-comparison.ts"
import {
  NUMERIC_CELL_PATTERN,
  numericCellMagnitude,
} from "../../../../../../../shared/report/table-layout.ts"
import {
  tableCellTexts,
  tableRowFilterTexts,
} from "../../../../../../../shared/report/table-view.ts"

export type TableSort = { readonly column: number; readonly direction: "asc" | "desc" }

type TablePart = A2uiReportPart<"Table">

/**
 * 表示する行の元の添字を、表示の順に返す。
 * 絞り込みは、選んだ値のどれかが対象の列（`filterColumn`、なければ全列）のセルの文字に完全一致する行を残す。選びが空なら絞らない。
 */
export function filteredRowOrder(part: TablePart, filter: readonly string[]): readonly number[] {
  return keptRows(part, filter).map(({ index }) => index)
}

/** 絞り込んだ行を `sort` の順に並べた、元の添字。セルが無い行は昇順で最後。 */
export function visibleRowOrder(
  part: TablePart,
  sort: TableSort,
  filter: readonly string[],
): readonly number[] {
  const sign = sort.direction === "asc" ? 1 : -1
  return keptRows(part, filter)
    .toSorted((a, b) => {
      const left = a.cells[sort.column]
      const right = b.cells[sort.column]
      const order =
        left !== undefined && right !== undefined
          ? compareCells(left, right)
          : Number(left === undefined) - Number(right === undefined)
      return order === 0 ? a.index - b.index : order * sign
    })
    .map(({ index }) => index)
}

function keptRows(part: TablePart, filter: readonly string[]) {
  return part.rows
    .map((row, index) => ({ index, cells: tableRowCells(row), row }))
    .filter(
      ({ row }) =>
        filter.length === 0 ||
        tableRowFilterTexts(row, part.filterColumn).some((text) => filter.includes(text)),
    )
}

/** 状態のセルは重さの順、数は大きさ、日付は時刻、それ以外は日本語の文字の順。 */
function compareCells(a: Cell, b: Cell): number {
  if (typeof a === "object" && "status" in a && typeof b === "object" && "status" in b) {
    return STATUS_RANK[a.status] - STATUS_RANK[b.status]
  }
  const left = sortText(a)
  const right = sortText(b)
  if (NUMERIC_CELL_PATTERN.test(left) && NUMERIC_CELL_PATTERN.test(right)) {
    return numericCellMagnitude(left) - numericCellMagnitude(right)
  }
  const leftTime = dateTime(left)
  const rightTime = dateTime(right)
  if (leftTime !== undefined && rightTime !== undefined) {
    return Temporal.PlainDateTime.compare(leftTime, rightTime)
  }
  return left.localeCompare(right, "ja", { numeric: true })
}

/** 変わったセルは変わったあとの値で並べる。 */
function sortText(cell: Cell): string {
  return tableCellTexts(cell).at(-1) ?? ""
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/

/** 日付だけの字は 0 時として扱う。存在しない日付は日付とみなさない。 */
function dateTime(text: string): Temporal.PlainDateTime | undefined {
  if (!DATE_PATTERN.test(text)) {
    return undefined
  }
  try {
    return Temporal.PlainDateTime.from(text, { overflow: "reject" })
  } catch {
    return undefined
  }
}

const STATUS_RANK = { ok: 0, warn: 1, ng: 2 } as const
