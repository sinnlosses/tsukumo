// `report` の記録が持つ部品の一覧（`a2ui` の版）を、A2UI の面で描くための値にする。
// `Markdown` の葉の Markdown は節の欄の Markdown と同じ組み方から塊ごとに取り、部品の ID に当てる。

import { zip } from "remeda"

import type { A2uiReportComponent } from "../report/a2ui-report-catalog.ts"
import {
  A2UI_ROOT_ID,
  type A2uiReportPart,
  a2uiLeafIds,
  a2uiOutlineSections,
  a2uiPartsById,
} from "../report/a2ui-report-outline.ts"
import type { RecordedReportFigure, ReportSection } from "../report/report-block.ts"
import type { ReportImageSource } from "../report/report-image-markdown.ts"
import { joinParts } from "../report/report-inline-markdown.ts"
import type { LeafValue, ReportLeafLayout } from "../report/report-leaf-value.ts"
import type { ReportSectionPieces } from "../report/report-markdown.ts"
import type { ReportRetrospective } from "../report/report-retrospective.ts"
import { tidiedSectionBlocks } from "../report/report-tidy.ts"
import type { MainViewA2uiReport } from "./main-view-shape.ts"

/** 部品の一覧で描く本文に要る、記録の欄。 */
export type A2uiReportSource = {
  readonly components: readonly A2uiReportComponent[]
  readonly conclusion: string
  readonly figure: RecordedReportFigure
  readonly retrospective: ReportRetrospective
  readonly sections: readonly ReportSection[]
}

/**
 * 部品の一覧を、節の欄の ID と `Markdown` の葉ごとの Markdown に当てる。
 * `pieces` は描く節の並び（`figure` の図の節 → 整形した `sections` → 振り返り）の塊ごとの Markdown で、添字が欄の ID。
 * 根の子ごとの葉の数が記録の `sections` の塊の数と食い違えば `none`（一覧から写した節ではない）。
 * `layout` は `pieces` を組んだときの値で、`values` を `leafValues` に葉の ID で当てる。
 */
export function a2uiReportView(
  report: A2uiReportSource,
  pieces: readonly ReportSectionPieces[],
  layout: ReportLeafLayout,
  imageSource: ReportImageSource,
): MainViewA2uiReport {
  const { values } = layout
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
      const markdownLeaves = section.leafIds.flatMap(
        (leafId, index): readonly (readonly [string, string])[] => {
          const position = kept.indexOf(index)
          return byId.get(leafId)?.component === "Markdown"
            ? [[leafId, piece === undefined || position < 0 ? "" : (piece.blocks[position] ?? "")]]
            : []
        },
      )
      const leafValues = section.leafIds.flatMap(
        (leafId, index): readonly (readonly [string, LeafValue])[] => {
          const value =
            piece === undefined ? undefined : values[acc.regionId]?.[kept.indexOf(index)]
          return value === undefined ? [] : [[leafId, value]]
        },
      )
      if (piece === undefined) {
        return { ...acc, markdownLeaves: [...acc.markdownLeaves, ...markdownLeaves] }
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
        markdownLeaves: [...acc.markdownLeaves, ...markdownLeaves],
        leafValues: [...acc.leafValues, ...leafValues],
      }
    },
    {
      regionId: report.figure.kind === "none" ? 0 : 1,
      sections: [],
      markdownLeaves: [],
      leafValues: [],
    },
  )
  const leafValues = Object.fromEntries([
    ...figureLeafValues(report, root, values),
    ...folded.leafValues,
    ...retrospectiveLeafValues(report, root, byId, values),
  ])
  return {
    kind: "surface",
    components: report.components,
    sections: Object.fromEntries(folded.sections),
    markdownLeaves: Object.fromEntries(folded.markdownLeaves),
    leafValues,
    imageSource,
  }
}

/** `Report.figure` の葉の値。図の節は描く並びの先頭にある。 */
function figureLeafValues(
  report: A2uiReportSource,
  root: A2uiReportPart<"Report">,
  values: readonly (readonly LeafValue[])[],
): readonly (readonly [string, LeafValue])[] {
  const value = values[0]?.[0]
  return report.figure.kind === "none" || root.figure === undefined || value === undefined
    ? []
    : [[root.figure, value]]
}

/**
 * 振り返りの葉の値。振り返りの節は描く並びの最後で、先頭の塊は要約の `text`。
 * 振り返りの葉の数が記録の塊の数と食い違えば（読み損ねた塊を落としている）持たない。
 */
function retrospectiveLeafValues(
  report: A2uiReportSource,
  root: A2uiReportPart<"Report">,
  byId: ReadonlyMap<string, A2uiReportComponent>,
  values: readonly (readonly LeafValue[])[],
): readonly (readonly [string, LeafValue])[] {
  if (report.retrospective.kind === "none") {
    return []
  }
  const leafIds = a2uiLeafIds(root.retrospective?.blocks ?? [], byId)
  const retrospective = values.at(-1) ?? []
  return leafIds.length === report.retrospective.blocks.length
    ? leafIds.flatMap((leafId, index): readonly (readonly [string, LeafValue])[] => {
        const value = retrospective[index + 1]
        return value === undefined ? [] : [[leafId, value]]
      })
    : []
}

type ViewFold = {
  readonly regionId: number
  readonly sections: readonly (readonly [
    string,
    { readonly regionId: number; readonly heading: string },
  ])[]
  readonly markdownLeaves: readonly (readonly [string, string])[]
  readonly leafValues: readonly (readonly [string, LeafValue])[]
}
