// 描いたレポートと、いま届いたレポートの引数が同じかの判定。

import { isDeepEqual, omit } from "remeda"

import { reportOutline } from "../../../shared/report/report-outline.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { ReportDraft } from "./report-violation.ts"

/**
 * 文字列の2つの欄は前後の空白を除いて、`figure` と `checks` は中身で、
 * 本文は `components` の節の見出しと葉の中身の並びで比べる（部品の ID の付け替えは差に数えない）。
 */
export function isSameReport(
  drawn: Extract<SessionEvent, { readonly kind: "report" }>,
  draft: ReportDraft,
): boolean {
  return (
    drawn.conclusion.trim() === draft.conclusion.trim() &&
    isDeepEqual(drawn.figure, draft.figure) &&
    isDeepEqual(sectionContents(drawn.components), sectionContents(draft.components)) &&
    drawn.favor.trim() === draft.favor.trim() &&
    isDeepEqual(drawn.checks, draft.checks)
  )
}

function sectionContents(components: ReportDraft["components"]) {
  return reportOutline(components).sections.map((section) => ({
    ...omit(section, ["leaves"]),
    leaves: section.leaves.map((leaf) => omit(leaf, ["id"])),
  }))
}
