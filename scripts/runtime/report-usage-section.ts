// 使われ方の集計の表のうち、「割合の1行」だけで済む欄（2行以下の表・`keyFigures`・段1の図・前後図の無い modified）の組み立て。

import type { KeyFiguresRow, UsageRecord } from "./report-usage-row.ts"

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
export function shortTableSection(rows: readonly UsageRecord[]): string {
  if (rows.length === 0) {
    return "2行以下の表のあるレポート: 記録した行が無い"
  }
  return [
    `2行以下の表のあるレポート（${String(rows.length)}件のうち。外す基準の対象ではない。差し戻しにしない）:`,
    shareLine("全レポート", "2行以下の表あり", rows, (record) => record.shortTable),
    shareLine(
      "task の最終レポート",
      "2行以下の表あり",
      rows.filter((record) => record.forTask),
      (record) => record.shortTable,
    ),
  ].join("\n")
}

/** modified のファイルがあるレポートのうち、前後図も画像も無かった数。`hasModifiedFiles` が常に false になる前の記録だけが数に入る。 */
export function modifiedWithoutVisualSection(reports: readonly UsageRecord[]): string {
  if (reports.length === 0) {
    return "modified のファイルがあるのに前後図も画像も無いレポート: 記録した行が無い"
  }
  return [
    `modified のファイルがあるのに前後図も画像も無いレポート（前後図・画像の有無を記録した${String(reports.length)}件のうち。外す基準の対象ではない）:`,
    modifiedWithoutVisualLine("全レポート", reports),
    modifiedWithoutVisualLine(
      "task の最終レポート",
      reports.filter((record) => record.forTask),
    ),
  ].join("\n")
}

/** 段1の図（image・mermaid・graph・svg。beforeAfter の側を含む）を含むレポートの割合。 */
export function figureSection(rows: readonly UsageRecord[]): string {
  if (rows.length === 0) {
    return "段1の図を含むレポート: 記録した行が無い"
  }
  return [
    `段1の図（image・mermaid・graph・svg。beforeAfter の側を含む）を含むレポート（図の有無を記録した${String(rows.length)}件のうち。外す基準の対象ではない）:`,
    shareLine("全レポート", "図あり", rows, (record) => record.hasFigure),
    shareLine(
      "task の最終レポート",
      "図あり",
      rows.filter((record) => record.forTask),
      (record) => record.hasFigure,
    ),
  ].join("\n")
}

/** `keyFigures` の有無と、結論の文に数が3つ以上あるのに無いレポートの割合。分母は `keyFigures` の欄を記録した行。差し戻しにはしない。 */
export function keyFiguresSection(rows: readonly KeyFiguresRow[]): string {
  if (rows.length === 0) {
    return "keyFigures: 記録した行が無い"
  }
  const forTask = rows.filter((record) => record.forTask)
  return [
    `keyFigures（${String(rows.length)}件のうち。28日の数を見てから差し戻すか決める）:`,
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

function modifiedWithoutVisualLine(label: string, rows: readonly UsageRecord[]): string {
  const modified = rows.filter((record) => record.hasModifiedFiles)
  const missing = modified.filter((record) => !record.hasBeforeAfterOrImage).length
  const percent = (modified.length === 0 ? 0 : (missing / modified.length) * 100).toFixed(1)
  return `  ${label.padEnd(16)} modified あり ${String(modified.length).padStart(5)}  うち前後図も画像も無し ${String(missing).padStart(5)}  ${percent.padStart(5)}%`
}
