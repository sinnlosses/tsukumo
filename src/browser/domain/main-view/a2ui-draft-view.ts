// `a2ui` の版の `report` の部品の一覧（届いた途中のものを含む）を、草稿として描く値にする。
//
// 会話の内容がここを通る。ログにもファイルにも書かない。

import type {
  A2uiReportComponent,
  A2uiWrittenComponent,
} from "../../../shared/report/a2ui-report-catalog.ts"
import {
  A2UI_ROOT_ID,
  a2uiLeafIds,
  a2uiPartsById,
  type A2uiReportPart,
  a2uiReachableIds,
} from "../../../shared/report/a2ui-report-outline.ts"
import { sectionDrawsAnything } from "../../../shared/report/drawn-entry-markdown.ts"
import { drawnReportOf } from "../../../shared/report/report-drawn-outline.ts"
import type { ReportImageSource } from "../../../shared/report/report-image-markdown.ts"
import { reportLeafLayoutOf } from "../../../shared/report/report-leaf-value.ts"
import { writtenReportView } from "../../../shared/report/report-static-component-list.ts"
import { parseReportTask, type ReportTask } from "../../../shared/report/report-task.ts"
import { a2uiReportView } from "../../../shared/session/a2ui-report-view.ts"
import type {
  MainViewDraft,
  MainViewReportRegions,
  MainViewSurfaceStatus,
} from "../../../shared/session/main-view-shape.ts"
import { isBlankText } from "../../../shared/utils/blank-text.ts"
import { draftPendingOf, NO_DRAFT_PENDING } from "./a2ui-draft-pending.ts"

/**
 * 草稿の出どころ。
 * `writing` は引数をいま書いている途中か（真のあいだ、届いていない部品を骨組みにし、根が届く前から紙を出す）。
 * `imageSource` は画像の取り出し元。置き場に置く前の草稿は `pending`。
 */
export type DraftSource = {
  readonly writing: boolean
  readonly imageSource: ReportImageSource
}

/** 草稿は段ごとの所要時間も変更したファイルも持たない。 */
const NO_SURFACE_STATUS = {
  phaseTimes: { kind: "none" },
  changedFiles: { kind: "none" },
  verification: { kind: "none" },
} as const satisfies MainViewSurfaceStatus

/**
 * 部品の一覧から草稿を作る。根の `Report` が無ければ、書いている途中は `blank`、書いていなければ undefined（何も描かない）。
 * 描くのは根から辿れる部品だけ。
 */
export function mainViewDraftOf(
  toolUseId: string,
  components: readonly A2uiReportComponent[],
  written: readonly A2uiWrittenComponent[],
  source: DraftSource,
): MainViewDraft | undefined {
  const byId = a2uiPartsById(components)
  const root = byId.get(A2UI_ROOT_ID)
  if (root?.component !== "Report") {
    return source.writing ? { kind: "blank", toolUseId } : undefined
  }
  const reachable = a2uiReachableIds(byId)
  const parts = [...byId.values()].filter((part) => reachable.has(part.id))
  const task = parseReportTask(root.task)
  return {
    kind: "parts",
    toolUseId,
    writing: source.writing,
    components: parts,
    regions: draftRegions(toolUseId, root, parts, written, task, source.imageSource),
    task,
    pending: source.writing ? draftPendingOf(byId) : NO_DRAFT_PENDING,
  }
}

/**
 * 草稿の欄。結論の形と数のカードは確定版と同じ決め方で、合図の行と所要時間は確定で足される。
 * 欄の並びは、内容部品が1つ以上届いた節だけから作る（内容部品の無い `Section` は欄にならない）。
 * 面の部品には内容部品の無い `Section` も残し、描く側が見出しを先に出せるようにする。
 */
function draftRegions(
  toolUseId: string,
  root: A2uiReportPart<"Report">,
  parts: readonly A2uiReportComponent[],
  written: readonly A2uiWrittenComponent[],
  task: ReportTask,
  imageSource: ReportImageSource,
): MainViewReportRegions {
  const byId = a2uiPartsById(parts)
  const drawn = parts.filter(
    (part) => part.component !== "Section" || a2uiLeafIds([part.id], byId).length > 0,
  )
  const conclusion = (root.conclusion ?? []).join("")
  const drawnReport = drawnReportOf(drawn, conclusion, "body")
  const tidied = drawnReport.sections.map((section) => section.section)
  const layout = reportLeafLayoutOf(tidied)
  return {
    kind: "regions",
    sections: tidied.flatMap((section, id) =>
      sectionDrawsAnything(section, layout.values[id] ?? [])
        ? [{ id, heading: section.heading.trim() }]
        : [],
    ),
    a2ui: a2uiReportView(
      parts,
      writtenReportView(written, "locked"),
      drawnReport,
      layout,
      imageSource,
      {
        lead: isBlankText(conclusion)
          ? { kind: "none" }
          : { kind: task.kind === "task" ? "conclusion" : "conclusion-lead", text: conclusion },
        keyFigures: root.keyFigures ?? [],
        checks: { kind: "none" },
        status: NO_SURFACE_STATUS,
        finalStatus: NO_SURFACE_STATUS,
      },
      { id: `favor-${toolUseId}`, text: "" },
    ),
  }
}
