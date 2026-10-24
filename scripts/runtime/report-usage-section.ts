// 使われ方の集計の表のうち、「割合の1行」だけで済む欄（2行以下の表・`keyFigures`）の組み立て。

import type { UsageRecord } from "./report-usage-row.ts"

export type ShortTableRecord = Extract<UsageRecord, { readonly shortTable: boolean }>
export type KeyFiguresRecord = Extract<UsageRecord, { readonly hasKeyFigures: boolean }>

export function shareLine<Row>(
  label: string,
  what: string,
  rows: readonly Row[],
  matches: (row: Row) => boolean,
): string {
  const count = rows.filter(matches).length
  const percent = (rows.length === 0 ? 0 : (count / rows.length) * 100).toFixed(1)
  return `  ${label.padEnd(16)} ${what} ${String(count).padStart(5)}  ${String(rows.length).padStart(5)}件のうち ${percent.padStart(5)}%`
}

/** 行が2つ以下の表のあるレポートの割合。 */
export function shortTableSection(rows: readonly ShortTableRecord[]): string {
  if (rows.length === 0) {
    return "2行以下の表のあるレポート: 記録した行が無い"
  }
  return [
    `2行以下の表のあるレポート（版10以降の${String(rows.length)}件のうち。外す基準の対象ではない。差し戻しにしない）:`,
    shareLine("全レポート", "2行以下の表あり", rows, (record) => record.shortTable),
    shareLine(
      "task の最終レポート",
      "2行以下の表あり",
      rows.filter((record) => record.forTask),
      (record) => record.shortTable,
    ),
  ].join("\n")
}

/** `keyFigures` の有無と、結論の文に数が3つ以上あるのに無いレポートの割合。分母は版20以降の行。差し戻しにはしない。 */
export function keyFiguresSection(rows: readonly KeyFiguresRecord[]): string {
  if (rows.length === 0) {
    return "keyFigures: 版20以降の行が無い"
  }
  const forTask = rows.filter((record) => record.forTask)
  return [
    `keyFigures（版20以降の${String(rows.length)}件のうち。28日の数を見てから差し戻すか決める）:`,
    shareLine("全レポート", "keyFigures あり", rows, (record) => record.hasKeyFigures),
    shareLine(
      "全レポート",
      "結論に数3つ以上で無し",
      rows,
      (record) => record.conclusionNumbersWithoutKeyFigures,
    ),
    shareLine("task の最終レポート", "keyFigures あり", forTask, (record) => record.hasKeyFigures),
    shareLine(
      "task の最終レポート",
      "結論に数3つ以上で無し",
      forTask,
      (record) => record.conclusionNumbersWithoutKeyFigures,
    ),
  ].join("\n")
}
