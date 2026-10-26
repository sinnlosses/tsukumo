// `report` の引数の字数の分布を、受け付けと差し戻しで並べた節。

import type { RejectionRecord, UsageRecord } from "./report-usage-row.ts"

/**
 * 引数の字数（JSON にした字数。トークンの代わり）の分布。分母は受け付けの行と差し戻しの行。
 * 受け付けも差し戻しも、モデルが書いた生の引数の字数（差し戻しから引き継いだ欄は数えない）。
 * 形の検査で落ちた呼び出し（handler に届かなかったものと、組んだ値が落ちたもの）は、理由が `tool-error` の差し戻しの行に入る。
 */
export function argumentCharsSection(
  accepted: readonly UsageRecord[],
  rejected: readonly RejectionRecord[],
): string {
  if (accepted.length === 0) {
    return "引数の字数: 記録した行が無い"
  }
  const spreadLine = (label: string, values: readonly number[]): string =>
    `  ${label.padEnd(18)} ${String(values.length).padStart(5)}件  中央値 ${String(percentile(values, 0.5)).padStart(6)}  p90 ${String(percentile(values, 0.9)).padStart(6)}`
  const acceptedMedian = percentile(
    accepted.map((record) => record.argumentChars.total),
    0.5,
  )
  const rejectedMedian = percentile(
    rejected.map((row) => row.argumentChars.total),
    0.5,
  )
  const fieldNames = [
    ...new Set(accepted.flatMap((record) => Object.keys(record.argumentChars.fields))),
  ].toSorted()
  return [
    `引数の字数（受け付け${String(accepted.length)}件、差し戻し${String(rejected.length)}件。外す基準の対象ではない）:`,
    spreadLine(
      "受け付け 全体",
      accepted.map((record) => record.argumentChars.total),
    ),
    spreadLine(
      "差し戻し 全体",
      rejected.map((row) => row.argumentChars.total),
    ),
    acceptedMedian === 0 || rejected.length === 0
      ? "  差し戻しの出し直し: 差し戻しの字数の記録が無い"
      : `  差し戻し1回の字数（中央値）は受け付けの ${((rejectedMedian / acceptedMedian) * 100).toFixed(1)}%（直し1回ごとに書いた量）`,
    "引き継ぎで出した呼び出し（差し戻しから欄を1つ以上引き継いだもの）:",
    inheritanceLine(
      "受け付け",
      accepted.map((record) => record.inheritedFields),
    ),
    inheritanceLine(
      "差し戻し",
      rejected.map((row) => row.inheritedFields),
    ),
    "欄ごと（受け付けのうち、その欄を渡した行）:",
    ...fieldNames.map((name) =>
      spreadLine(
        name,
        accepted.flatMap((record) => {
          const chars = record.argumentChars.fields[name]
          return chars === undefined ? [] : [chars]
        }),
      ),
    ),
  ].join("\n")
}

/** 昇順にしたときの `ratio` 位置の値（最近順位法）。空なら 0。 */
export function percentile(values: readonly number[], ratio: number): number {
  const sorted = values.toSorted((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}

function inheritanceLine(label: string, inherited: readonly (readonly string[])[]): string {
  const count = inherited.filter((fields) => fields.length > 0).length
  const percent = (inherited.length === 0 ? 0 : (count / inherited.length) * 100).toFixed(1)
  return `  ${label.padEnd(18)} ${String(count).padStart(5)}件  ${String(inherited.length)}件のうち ${percent}%`
}
