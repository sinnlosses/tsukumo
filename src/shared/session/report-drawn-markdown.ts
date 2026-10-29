// `report` の記録の部品の一覧から、描く節の並びと、その節の塊ごとの Markdown を導く。

import type { DrawnReport } from "../report/report-drawn-outline.ts"
import { drawnReportOf } from "../report/report-drawn-outline.ts"
import type { ReportImageSource } from "../report/report-image-markdown.ts"
import { type ReportLeafLayout, reportLeafLayoutOf } from "../report/report-leaf-value.ts"
import { type ReportSectionPieces, reportSectionPieces } from "../report/report-markdown.ts"
import type { SessionRecord } from "./session-record.ts"

type ReportRecord = Extract<SessionRecord, { readonly kind: "report" }>

export type ReportDrawnPieces = {
  readonly drawn: DrawnReport
  readonly layout: ReportLeafLayout
  readonly imageSource: ReportImageSource
  /** `drawn.sections` と同じ並びの、節の塊ごとの Markdown。 */
  readonly pieces: readonly ReportSectionPieces[]
}

export function reportDrawnPieces(report: ReportRecord): ReportDrawnPieces {
  const drawn = drawnReportOf(report.components, report.conclusion, "whole")
  const layout = reportLeafLayoutOf(drawn.sections.map((section) => section.section))
  const imageSource = {
    kind: "shelved",
    toolUseId: report.toolUseId,
    sizes: report.imageSizes,
    unshelved: report.unshelvedImages,
  } as const
  const pieces = reportSectionPieces(
    drawn.sections.map((section) => section.section),
    imageSource,
    layout,
  )
  return {
    drawn,
    layout,
    imageSource,
    pieces,
  }
}
