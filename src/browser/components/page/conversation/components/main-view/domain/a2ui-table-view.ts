// 操作できる `Table`（`sortable`・`filterable`）の、並べ替えと絞り込みの判定と、表の Markdown の組み直し。

import type { A2uiReportPart } from "../../../../../../../shared/report/a2ui-report-outline.ts"
import {
  type TableCell as Cell,
  tableRowCells,
} from "../../../../../../../shared/report/report-block-comparison.ts"
import {
  NUMERIC_CELL_PATTERN,
  numericCellMagnitude,
} from "../../../../../../../shared/report/report-table-markdown.ts"
import {
  tableCellTexts,
  tableRowFilterTexts,
} from "../../../../../../../shared/report/table-view.ts"
import type { MainViewTableRows } from "../../../../../../../shared/session/main-view-shape.ts"

export type TableSort = { readonly column: number; readonly direction: "asc" | "desc" }

type TablePart = A2uiReportPart<"Table">

/**
 * 表示する行の元の添字を、表示の順に返す。
 * 絞り込みは、選んだ値のどれかが対象の列（`filterColumn`、なければ全列）のセルの文字に完全一致する行を残す。選びが空なら絞らない。
 */
export function visibleRowOrder(
  part: TablePart,
  sort: TableSort | undefined,
  filter: readonly string[],
): readonly number[] {
  const kept = part.rows
    .map((row, index) => ({ index, cells: tableRowCells(row), row }))
    .filter(
      ({ row }) =>
        filter.length === 0 ||
        tableRowFilterTexts(row, part.filterColumn).some((text) => filter.includes(text)),
    )
  if (sort === undefined) {
    return kept.map(({ index }) => index)
  }
  const sign = sort.direction === "asc" ? 1 : -1
  return kept
    .toSorted((a, b) => {
      const order = compareCells(a.cells[sort.column], b.cells[sort.column])
      return order === 0 ? a.index - b.index : order * sign
    })
    .map(({ index }) => index)
}

/** 表の Markdown を、`order`（元の行の添字）の行だけ・その順に並べて組み直す。行が 0 件なら見出しの行だけの表になる。 */
export function arrangedTableMarkdown(table: MainViewTableRows, order: readonly number[]): string {
  return `${table.before}${order.flatMap((index) => table.rows[index] ?? []).join("\n")}${table.after}`
}

/** 状態のセルは重さの順、数は大きさ、日付は時刻、それ以外は日本語の文字の順。セルが無ければ最後。 */
function compareCells(a: Cell | undefined, b: Cell | undefined): number {
  if (a === undefined || b === undefined) {
    return a === b ? 0 : a === undefined ? 1 : -1
  }
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
