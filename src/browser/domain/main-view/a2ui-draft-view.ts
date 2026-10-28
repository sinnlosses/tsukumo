// `a2ui` の版の `report` の部品の一覧（届いた途中のものを含む）を、草稿として描く値にする。
//
// 会話の内容がここを通る。ログにもファイルにも書かない。

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import { a2uiReportFields } from "../../../shared/report/a2ui-report-input.ts"
import {
  A2UI_ROOT_ID,
  a2uiLeafIds,
  a2uiPartsById,
  a2uiReachableIds,
} from "../../../shared/report/a2ui-report-outline.ts"
import { parseReportSections } from "../../../shared/report/report-block.ts"
import { joinParts } from "../../../shared/report/report-inline-markdown.ts"
import { reportSectionPieces } from "../../../shared/report/report-markdown.ts"
import { tagTonesOf } from "../../../shared/report/report-table-markdown.ts"
import { tidyReportSections } from "../../../shared/report/report-tidy.ts"
import { a2uiReportView } from "../../../shared/session/a2ui-report-view.ts"
import type {
  MainViewDraft,
  MainViewReportRegions,
} from "../../../shared/session/main-view-shape.ts"
import { isBlankText } from "../../../shared/utils/blank-text.ts"

/**
 * 部品の一覧から草稿を作る。根の `Report` が無ければ undefined（根から辿れないので何も描かない）。
 * 描くのは根から辿れる部品だけで、葉がまだ1つも届いていない `Section` も描かない
 * （葉の無い節は欄にならず、節の並びと部品の対応が崩れるため）。
 */
export function mainViewDraftOf(
  toolUseId: string,
  components: readonly A2uiReportComponent[],
): MainViewDraft | undefined {
  const byId = a2uiPartsById(components)
  const root = byId.get(A2UI_ROOT_ID)
  if (root?.component !== "Report") {
    return undefined
  }
  const reachable = a2uiReachableIds(byId)
  const drawn = [...byId.values()].filter(
    (part) =>
      reachable.has(part.id) &&
      (part.component !== "Section" || a2uiLeafIds([part.id], byId).length > 0),
  )
  return { toolUseId, components: drawn, regions: draftRegions(toolUseId, root, drawn) }
}

function draftRegions(
  toolUseId: string,
  root: Extract<A2uiReportComponent, { readonly component: "Report" }>,
  drawn: readonly A2uiReportComponent[],
): MainViewReportRegions {
  const conclusion = (root.conclusion ?? []).join("")
  const { sections } = parseReportSections(a2uiReportFields(root, a2uiPartsById(drawn)).sections)
  const tidied = tidyReportSections({ conclusion, sections })
  const pieces = reportSectionPieces(tidied, { kind: "none" })
  const head = isBlankText(conclusion)
    ? ""
    : `<div class="conclusion-lead">\n\n${conclusion}\n\n</div>`
  return {
    kind: "regions",
    head,
    finalHead: head,
    sections: tidied.flatMap((section, id) => {
      const piece = pieces[id]
      const markdown = piece === undefined ? "" : joinParts([piece.heading, ...piece.blocks])
      return markdown === "" ? [] : [{ id, heading: section.heading.trim(), markdown }]
    }),
    retrospective: "",
    favor: { id: `favor-${toolUseId}`, markdown: "" },
    a2ui: a2uiReportView(
      { components: drawn, conclusion, figure: { kind: "none", reason: "unrecorded" }, sections },
      pieces,
      tagTonesOf(tidied),
    ),
  }
}
