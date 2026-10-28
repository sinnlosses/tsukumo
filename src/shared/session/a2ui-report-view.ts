// `report` の記録が持つ部品の一覧（`a2ui` の版）を、A2UI の面で描くための値にする。
// 葉の Markdown は節の欄の Markdown と同じ組み方から塊ごとに取り、部品の ID に当てる。

import { zip } from "remeda"

import type { A2uiReportComponent } from "../report/a2ui-report-catalog.ts"
import { A2UI_ROOT_ID, a2uiOutlineSections, a2uiPartsById } from "../report/a2ui-report-outline.ts"
import type { RecordedReportFigure, ReportSection } from "../report/report-block.ts"
import { joinParts } from "../report/report-inline-markdown.ts"
import type { ReportSectionPieces } from "../report/report-markdown.ts"
import { tidiedSectionBlocks } from "../report/report-tidy.ts"
import type { MainViewA2uiReport } from "./main-view-shape.ts"

/** 部品の一覧で描く本文に要る、記録の欄。 */
export type A2uiReportSource = {
  readonly components: readonly A2uiReportComponent[]
  readonly conclusion: string
  readonly figure: RecordedReportFigure
  readonly sections: readonly ReportSection[]
}

/**
 * 部品の一覧を、節の欄の ID と葉ごとの Markdown に当てる。
 * `pieces` は描く節の並び（`figure` の図の節 → 整形した `sections` → 振り返り）の塊ごとの Markdown で、添字が欄の ID。
 * 根の子ごとの葉の数が記録の `sections` の塊の数と食い違えば `none`（一覧から写した節ではない）。
 */
export function a2uiReportView(
  report: A2uiReportSource,
  pieces: readonly ReportSectionPieces[],
): MainViewA2uiReport {
  const byId = a2uiPartsById(report.components)
  const root = byId.get(A2UI_ROOT_ID)
  if (root?.component !== "Report") {
    return { kind: "none" }
  }
  const outline = a2uiOutlineSections(root, byId)
  const matched =
    outline.length === report.sections.length &&
    zip(outline, report.sections).every(
      ([section, recorded]) => section.leafIds.length === recorded.blocks.length,
    )
  if (!matched) {
    return { kind: "none" }
  }
  const tidied = tidiedSectionBlocks({
    conclusion: report.conclusion,
    sections: report.sections,
  })
  const folded = zip(outline, tidied).reduce<ViewFold>(
    (acc, [section, blocks]) => {
      const kept = blocks.flatMap((block, index) => (block.kind === "kept" ? [index] : []))
      const piece = kept.length === 0 ? undefined : pieces[acc.regionId]
      const leaves = section.leafIds.map((leafId, index): readonly [string, string] => {
        const position = kept.indexOf(index)
        return [leafId, piece === undefined || position < 0 ? "" : (piece.blocks[position] ?? "")]
      })
      if (piece === undefined) {
        return { ...acc, leaves: [...acc.leaves, ...leaves] }
      }
      const drawn = joinParts([piece.heading, ...piece.blocks]) !== ""
      return {
        regionId: acc.regionId + 1,
        sections: drawn
          ? [
              ...acc.sections,
              [section.componentId, { regionId: acc.regionId, heading: piece.heading }],
            ]
          : acc.sections,
        leaves: [...acc.leaves, ...leaves],
      }
    },
    { regionId: report.figure.kind === "none" ? 0 : 1, sections: [], leaves: [] },
  )
  return {
    kind: "surface",
    components: report.components,
    sections: Object.fromEntries(folded.sections),
    leaves: Object.fromEntries(folded.leaves),
  }
}

type ViewFold = {
  readonly regionId: number
  readonly sections: readonly (readonly [
    string,
    { readonly regionId: number; readonly heading: string },
  ])[]
  readonly leaves: readonly (readonly [string, string])[]
}
