// 段 `count` の条ごとに、通した `report` が当たった回数。割合は受け付けた `report` に対する。

import {
  REPORT_REJECTION_MODES,
  type ReportRejectionMode,
} from "../../src/server/report/core/rejection-mode.ts"
import { table } from "./count-table.ts"
import type { CountedRecord } from "./report-usage-row.ts"

export function countedSection(
  acceptedCount: number,
  countedRecords: readonly CountedRecord[],
): string {
  const countingNames = Object.entries<ReportRejectionMode>(REPORT_REJECTION_MODES)
    .filter(([, mode]) => mode === "count")
    .map(([reason]) => reason)
  if (countingNames.length === 0 && countedRecords.length === 0) {
    return "数えるだけの条 × 回数: 数えるだけの条は無い"
  }
  return table(
    `数えるだけの条 × 回数（割合は受け付けた \`report\` ${String(acceptedCount)}回に対する）`,
    countingNames,
    countedRecords,
    (record) => record.reasons,
    acceptedCount,
  )
}
