// 操作できる `Table`（`sortable`・`filterable`）の、並べ替えと絞り込みの判定。

import type { A2uiReportComponent } from "../../../../../../../shared/report/a2ui-report-catalog.ts"
import type { A2uiReportPart } from "../../../../../../../shared/report/a2ui-report-outline.ts"
import {
  type TableCell as Cell,
  tableRowCells,
  tableRowDepth,
} from "../../../../../../../shared/report/report-block-comparison.ts"
import {
  NUMERIC_CELL_PATTERN,
  numericCellMagnitude,
  type TableTotals,
  tableTotalsOf,
} from "../../../../../../../shared/report/table-layout.ts"
import {
  tableCellTexts,
  tableIdOfFilterPath,
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

const MIN_BADGES = 2
const MAX_BADGES = 6

export type FilterBadge = { readonly value: string; readonly count: number }

/**
 * `filterable` と `filterColumn` を持つ表の、列の値と行数を初出の順に返す。
 * 値の種類が 2 から 6 でなければ空。
 */
export function filterBadges(part: TablePart): readonly FilterBadge[] {
  if (part.filterable !== true || part.filterColumn === undefined) {
    return []
  }
  const counts = new Map<string, number>()
  for (const row of part.rows) {
    for (const text of new Set(tableRowFilterTexts(row, part.filterColumn))) {
      counts.set(text, (counts.get(text) ?? 0) + 1)
    }
  }
  return counts.size >= MIN_BADGES && counts.size <= MAX_BADGES
    ? [...counts].map(([value, count]) => ({ value, count }))
    : []
}

/** `/view/<tableId>/filter` に `value` を結んだ `ChoicePicker` があるか。 */
export function hasBoundChoicePicker(
  parts: Iterable<A2uiReportComponent>,
  tableId: string,
): boolean {
  return [...parts].some(
    (part) =>
      part.component === "ChoicePicker" &&
      !Array.isArray(part.value) &&
      tableIdOfFilterPath(part.value.path) === tableId,
  )
}

/**
 * 絞り込んだ行を `sort` の順に並べた、元の添字。セルが無い行は昇順で最後。
 * 字下げのある表は同じ親の子どうしの中だけで並べ、子は部分木ごと親の直下に付く。
 */
export function visibleRowOrder(
  part: TablePart,
  sort: TableSort,
  filter: readonly string[],
): readonly number[] {
  const sign = sort.direction === "asc" ? 1 : -1
  const parents = parentIndexes(part)
  const kept = keptRows(part, filter)
  const compare = (a: KeptRow, b: KeptRow): number => {
    const left = a.cells[sort.column]
    const right = b.cells[sort.column]
    const order =
      left !== undefined && right !== undefined
        ? compareCells(left, right)
        : Number(left === undefined) - Number(right === undefined)
    return order === 0 ? a.index - b.index : order * sign
  }
  const subtreeOf = (parent: number): readonly KeptRow[] =>
    kept
      .filter(({ index }) => parents[index] === parent)
      .toSorted(compare)
      .flatMap((row) => [row, ...subtreeOf(row.index)])
  return subtreeOf(ROOT).map(({ index }) => index)
}

/**
 * 見せる行（`rowOrder` の元の添字）だけを足した合計。
 * 合計の行と列は `rows` に入らないので並べ替え・絞り込みの対象にならず、表の最後に残る。
 */
export function visibleTableTotals(part: TablePart, rowOrder: readonly number[]): TableTotals {
  return tableTotalsOf({
    heat: part.heat,
    totals: part.totals,
    rows: rowOrder.flatMap((index) => {
      const row = part.rows[index]
      return row === undefined ? [] : [row]
    }),
  })
}

type KeptRow = { readonly index: number; readonly cells: readonly Cell[] }

/** 選びに合う行と、その祖先（字下げの親をたどった行）を元の順で返す。 */
function keptRows(part: TablePart, filter: readonly string[]): readonly KeptRow[] {
  const parents = parentIndexes(part)
  const matched = part.rows.flatMap((row, index) =>
    filter.length === 0 ||
    tableRowFilterTexts(row, part.filterColumn).some((text) => filter.includes(text))
      ? [index]
      : [],
  )
  const kept = new Set(matched.flatMap((index) => [index, ...ancestorsOf(index, parents)]))
  return part.rows.flatMap((row, index) =>
    kept.has(index) ? [{ index, cells: tableRowCells(row) }] : [],
  )
}

const ROOT = -1

/** 行ごとの親の添字（前にある、段が1つ浅い最も近い行）。段 0 の行と親の見つからない行は `ROOT`。 */
function parentIndexes(part: TablePart): readonly number[] {
  const depths = part.rows.map(tableRowDepth)
  return depths.map((depth, index) =>
    depth === 0 ? ROOT : depths.slice(0, index).findLastIndex((other) => other === depth - 1),
  )
}

function ancestorsOf(index: number, parents: readonly number[]): readonly number[] {
  const parent = parents[index] ?? ROOT
  return parent === ROOT ? [] : [parent, ...ancestorsOf(parent, parents)]
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
