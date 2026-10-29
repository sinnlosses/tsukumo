// 体験の指標 `bodyChars`: 振り返りを除く描く節の、見出しと塊の文字列の値の字数。

import { drawnReportOf } from "../../../shared/report/report-drawn-outline.ts"
import type { SessionRecord } from "../../../shared/session/session-record.ts"

type ReportRecord = Extract<SessionRecord, { readonly kind: "report" }>

/** 塊の種類の印（`kind`）は数えない。 */
export function reportBodyChars(report: ReportRecord): number {
  const drawn = drawnReportOf(report.components, report.conclusion, "whole")
  return drawn.sections
    .filter((section) => section.role !== "retrospective")
    .reduce(
      (total, section) =>
        total +
        section.heading.trim().length +
        section.entries.reduce((sum, entry) => sum + stringChars(entry.block), 0),
      0,
    )
}

function stringChars(value: unknown): number {
  if (typeof value === "string") {
    return value.length
  }
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + stringChars(item), 0)
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).reduce(
      (sum, [key, item]) => (key === "kind" ? sum : sum + stringChars(item)),
      0,
    )
  }
  return 0
}
