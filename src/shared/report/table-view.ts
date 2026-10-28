// 操作できる `Table`（`sortable`・`filterable`）の、サーバの検査とブラウザの描画が共有する決まり。
// セルから絞り込みに使う文字を取る手と、操作の状態を置くデータモデルの path。

import { isPlainObject } from "remeda"

/** 操作の状態のキー。`ChoicePicker` が結ぶのは `filter` だけ。 */
type TableViewKey = "sort" | "filter"

/** 表 `tableId` の操作の状態を置くデータモデルの path（`/view/<TableのID>/<キー>`）。 */
export function tableViewPath(tableId: string, key: TableViewKey): string {
  return `/view/${tableId}/${key}`
}

const FILTER_PATH = /^\/view\/([^/]+)\/filter$/

/** `/view/<TableのID>/filter` の形の path から表の ID を読む。ほかの形なら undefined。 */
export function tableIdOfFilterPath(path: unknown): string | undefined {
  return typeof path === "string" ? FILTER_PATH.exec(path)?.[1] : undefined
}

/**
 * 行の絞り込みに使う文字。`column` があればその列のセルだけ、なければ全列のセル。
 * 行は、セルの並びか、強調の行（`cells` を持つ）。
 */
export function tableRowFilterTexts(row: unknown, column: number | undefined): readonly string[] {
  const cells: unknown = isPlainObject(row) ? row.cells : row
  if (!Array.isArray(cells)) {
    return []
  }
  return cells.flatMap((cell: unknown, position) =>
    column === undefined || column === position ? tableCellTexts(cell) : [],
  )
}

/**
 * セルが持つ文字。文字列のセルはその文字列、状態のセルは `text`、変わったセルは `from` と `to`、札は `tag`。
 * 絞り込みの一致と選択肢の検査は、この文字との完全一致で言う。
 */
export function tableCellTexts(cell: unknown): readonly string[] {
  if (typeof cell === "string") {
    return [cell]
  }
  if (!isPlainObject(cell)) {
    return []
  }
  return [cell.text, cell.from, cell.to, cell.tag].filter((text) => typeof text === "string")
}
