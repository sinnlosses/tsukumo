// 差し戻しの理由ごとの直り率。次の呼び出しで同じ理由が出なかった割合と、直した呼び出しの字数の中央値。
// 分母は次の呼び出しの結果を記録した行で、記録の無い行（旧い版・次が来なかった行）は外して脚注に件数を出す。

import { groupBy } from "remeda"

import { percentile } from "./argument-chars-section.ts"
import type { RejectionRecord } from "./report-usage-row.ts"

type Resolution = {
  readonly reason: string
  readonly nextReasons: readonly string[]
  readonly nextChars: number
}

export function rejectionResolutionSection(rejections: readonly RejectionRecord[]): string {
  const resolutions = rejections.flatMap(({ reasons, nextCall }): readonly Resolution[] =>
    nextCall === undefined
      ? []
      : reasons.map((reason) => ({
          reason,
          nextReasons: nextCall.reasons,
          nextChars: nextCall.chars,
        })),
  )
  const unrecorded = rejections.filter((rejection) => rejection.nextCall === undefined).length
  const rows = Object.entries(groupBy(resolutions, (resolution) => resolution.reason))
    .map(([reason, group]) => {
      const fixed = group.filter((resolution) => !resolution.nextReasons.includes(reason))
      return {
        reason,
        count: group.length,
        fixedCount: fixed.length,
        median: percentile(
          fixed.map((resolution) => resolution.nextChars),
          0.5,
        ),
      }
    })
    .toSorted((left, right) => right.count - left.count)
  return [
    "差し戻しの理由 × 直り率（次の呼び出しで同じ理由が出なかった割合。外す基準の対象ではない）:",
    ...(rows.length === 0
      ? ["  次の呼び出しを記録した差し戻しが無い"]
      : rows.map(
          (row) =>
            `  ${row.reason.padEnd(32)} ${String(row.count).padStart(4)}件  直った${String(row.fixedCount).padStart(4)}件  ${percent(row.fixedCount, row.count)}%  直した呼び出しの字数（中央値）${String(row.median)}`,
        )),
    `  次の呼び出しの記録が無い差し戻しの行（旧い版・次が来なかった）: ${String(unrecorded)}件は分母から外した`,
  ].join("\n")
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "0.0" : ((part / whole) * 100).toFixed(1)
}
