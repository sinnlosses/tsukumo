// 形の検査で落ちた呼び出し（`tool-error`）の、落ちた欄名の上位。
// 1回の呼び出しで同じ欄と code が複数出ても1回に数える。欄名は取れた行だけが持つので、分母は取れた行の数。

import { countBy } from "remeda"

import type { RejectionRecord } from "./report-usage-row.ts"

const TOP = 10

export function toolErrorFieldSection(rejections: readonly RejectionRecord[]): string {
  const toolErrors = rejections.filter((rejection) => rejection.reasons.includes("tool-error"))
  const withFields = toolErrors.filter((rejection) => (rejection.toolErrorFields ?? []).length > 0)
  const counted = countBy(
    withFields.flatMap((rejection) => [
      ...new Set((rejection.toolErrorFields ?? []).map((entry) => `${entry.field}  ${entry.code}`)),
    ]),
    (key) => key,
  )
  const rows = Object.entries(counted)
    .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, TOP)
  return [
    `tool-error の欄名 × 回数（上位${String(TOP)}。欄名は zod の path の添字を n に畳んだもの）:`,
    ...(rows.length === 0
      ? ["  欄名を記録した tool-error が無い"]
      : rows.map(([key, count]) => `  ${key.padEnd(56)} ${String(count).padStart(4)}回`)),
    `  tool-error ${String(toolErrors.length)}件のうち欄名を記録した行: ${String(withFields.length)}件`,
  ].join("\n")
}
