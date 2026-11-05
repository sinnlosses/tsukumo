// 描いたレポートと、いま届いたレポートの引数が同じかの判定。

import { isDeepEqual, omit } from "remeda"

import { reportFigureOf, reportOutline } from "../../../../shared/report/report-outline.ts"
import { staticReportComponents } from "../../../../shared/report/report-static-component-list.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import type { ReportDraft } from "../rules/draft.ts"

/**
 * 文字列の2つの欄は前後の空白を除いて、`checks` は中身で、
 * 図は `components` の図の申告と図の内容部品の中身で、本文は `components` の節の見出しと葉の中身の並びで比べる（部品の ID の付け替えは差に数えない）。
 */
export function isSameReport(
  drawn: Extract<SessionEvent, { readonly kind: "report" }>,
  draft: ReportDraft,
): boolean {
  const drawnComponents = staticReportComponents(drawn.components).components
  return (
    drawn.conclusion.trim() === draft.conclusion.trim() &&
    isDeepEqual(figureContents(drawnComponents), figureContents(draft.components)) &&
    isDeepEqual(sectionContents(drawnComponents), sectionContents(draft.components)) &&
    drawn.favor.trim() === draft.favor.trim() &&
    isDeepEqual(drawn.checks, draft.checks)
  )
}

function figureContents(components: ReportDraft["components"]) {
  return {
    declaration: reportFigureOf(components),
    leaves: reportOutline(components).figure.map((leaf) => omit(leaf, ["id"])),
  }
}

function sectionContents(components: ReportDraft["components"]) {
  return reportOutline(components).sections.map((section) => ({
    ...omit(section, ["leaves", "componentId"]),
    leaves: section.leaves.map((leaf) => omit(leaf, ["id"])),
  }))
}
