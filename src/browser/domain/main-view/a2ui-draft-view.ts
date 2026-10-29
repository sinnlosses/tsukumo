// `a2ui` の版の `report` の部品の一覧（届いた途中のものを含む）を、草稿として描く値にする。
//
// 会話の内容がここを通る。ログにもファイルにも書かない。

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import {
  A2UI_ROOT_ID,
  a2uiLeafIds,
  a2uiPartsById,
  a2uiReachableIds,
} from "../../../shared/report/a2ui-report-outline.ts"
import { drawnReportOf } from "../../../shared/report/report-drawn-outline.ts"
import { joinParts } from "../../../shared/report/report-inline-markdown.ts"
import { reportLeafLayoutOf } from "../../../shared/report/report-leaf-value.ts"
import { reportSectionPieces } from "../../../shared/report/report-markdown.ts"
import { a2uiReportView } from "../../../shared/session/a2ui-report-view.ts"
import type {
  MainViewDraft,
  MainViewReportRegions,
  MainViewSurfaceStatus,
} from "../../../shared/session/main-view-shape.ts"
import { isBlankText } from "../../../shared/utils/blank-text.ts"

/** 草稿は段ごとの所要時間も変更したファイルも持たない。 */
const NO_SURFACE_STATUS = {
  phaseTimes: { kind: "none" },
  changedFiles: { kind: "none" },
} as const satisfies MainViewSurfaceStatus

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
  const drawnReport = drawnReportOf(drawn, conclusion, "body")
  const tidied = drawnReport.sections.map((section) => section.section)
  const layout = reportLeafLayoutOf(tidied)
  const imageSource = { kind: "none" } as const
  const pieces = reportSectionPieces(tidied, imageSource, layout)
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
      drawn,
      drawnReport,
      pieces,
      layout,
      imageSource,
      {
        lead: isBlankText(conclusion)
          ? { kind: "none" }
          : { kind: "conclusion-lead", text: conclusion },
        keyFigures: [],
        checks: { kind: "none" },
        status: NO_SURFACE_STATUS,
        finalStatus: NO_SURFACE_STATUS,
      },
      { id: `favor-${toolUseId}`, text: "" },
    ),
  }
}
