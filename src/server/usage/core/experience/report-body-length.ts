// 体験の指標 `bodyChars`: 振り返りを除く描く節の、見出しと塊の文字列の値の字数。

import { isPlainObject, sumBy } from "remeda"

import { drawnReportOf } from "../../../../shared/report/report-drawn-outline.ts"
import { staticReportComponents } from "../../../../shared/report/report-static-component-list.ts"
import type { SessionRecord } from "../../../../shared/session/session-record.ts"

type ReportRecord = Extract<SessionRecord, { readonly kind: "report" }>

/** 塊の種類の印（`kind`）は数えない。 */
export function reportBodyChars(report: ReportRecord): number {
  const drawn = drawnReportOf(
    staticReportComponents(report.components).components,
    report.conclusion,
    "whole",
  )
  return sumBy(
    drawn.sections.filter((section) => section.role !== "retrospective"),
    (section) =>
      section.heading.trim().length + sumBy(section.entries, (entry) => stringChars(entry.block)),
  )
}

function stringChars(value: unknown): number {
  if (typeof value === "string") {
    return value.length
  }
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + stringChars(item), 0)
  }
  if (isPlainObject(value)) {
    return sumBy(Object.entries(value), ([key, item]) => (key === "kind" ? 0 : stringChars(item)))
  }
  return 0
}
