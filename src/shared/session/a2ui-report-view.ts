// `report` の記録が持つ部品の一覧を、A2UI の面で描くための値にする。
// `Markdown` の葉の Markdown は節の欄の Markdown と同じ組み方から塊ごとに取り、部品の ID に当てる。

import { zip } from "remeda"

import type { A2uiReportComponent } from "../report/a2ui-report-catalog.ts"
import { A2UI_ROOT_ID, a2uiPartsById } from "../report/a2ui-report-outline.ts"
import type { DrawnReport, DrawnSection } from "../report/report-drawn-outline.ts"
import type { ReportImageSource } from "../report/report-image-markdown.ts"
import { joinParts } from "../report/report-inline-markdown.ts"
import type { LeafValue, ReportLeafLayout } from "../report/report-leaf-value.ts"
import type { ReportSectionPieces } from "../report/report-markdown.ts"
import type {
  MainViewA2uiReport,
  MainViewSurfaceEntry,
  MainViewSurfaceHead,
  MainViewSurfaceLeafRegion,
} from "./main-view-shape.ts"

/**
 * 部品の一覧を、節の欄の ID と `Markdown` の葉ごとの Markdown に当てる。
 * `drawn` は描く節の並び（`drawnReportOf`）で、`pieces` はその節の塊ごとの Markdown。添字が欄の ID。
 * 根が `Report` でなければ `none`。
 * `layout` は `pieces` を組んだときの値で、`values` を `leafValues` に葉の ID で当てる。
 */
export function a2uiReportView(
  components: readonly A2uiReportComponent[],
  drawn: DrawnReport,
  pieces: readonly ReportSectionPieces[],
  layout: ReportLeafLayout,
  imageSource: ReportImageSource,
  head: MainViewSurfaceHead,
  favor: Extract<MainViewA2uiReport, { readonly kind: "surface" }>["favor"],
): MainViewA2uiReport {
  const byId = a2uiPartsById(components)
  if (byId.get(A2UI_ROOT_ID)?.component !== "Report") {
    return { kind: "none", head, favor }
  }
  const regions: readonly DrawnRegion[] = zip(drawn.sections, pieces).map(
    ([section, piece], regionId) => ({ section, piece, regionId }),
  )
  const droppedMarkdown = [...drawn.droppedLeafIds].flatMap(
    (leafId): readonly (readonly [string, string])[] =>
      byId.get(leafId)?.component === "Markdown" ? [[leafId, ""]] : [],
  )
  return {
    kind: "surface",
    components,
    sections: Object.fromEntries(
      regions.flatMap(({ section, piece, regionId }) =>
        section.role === "body" &&
        section.componentId !== undefined &&
        joinParts([piece.heading, ...piece.blocks]) !== ""
          ? [[section.componentId, { regionId, heading: piece.heading }]]
          : [],
      ),
    ),
    markdownLeaves: Object.fromEntries([
      ...droppedMarkdown,
      ...regions.flatMap(({ section, piece }) =>
        section.entries.flatMap(({ leafId }, index): readonly (readonly [string, string])[] =>
          leafId !== undefined && byId.get(leafId)?.component === "Markdown"
            ? [[leafId, piece.blocks[index] ?? ""]]
            : [],
        ),
      ),
    ]),
    figure: leafRegionOf(regions.find(({ section }) => section.role === "figure")),
    retrospective: leafRegionOf(regions.find(({ section }) => section.role === "retrospective")),
    leafValues: Object.fromEntries(
      regions.flatMap(({ section, regionId }) =>
        section.entries.flatMap(({ leafId }, index): readonly (readonly [string, LeafValue])[] => {
          const value = layout.values[regionId]?.[index]
          return leafId === undefined || value === undefined ? [] : [[leafId, value]]
        }),
      ),
    ),
    imageSource,
    head,
    favor,
  }
}

type DrawnRegion = {
  readonly section: DrawnSection
  readonly piece: ReportSectionPieces
  readonly regionId: number
}

/** 中身の塊が残らない欄は `none`。塊の Markdown が空の塊（傍注に寄せた覚え書きなど）は並べない。 */
function leafRegionOf(region: DrawnRegion | undefined): MainViewSurfaceLeafRegion {
  if (region === undefined || joinParts([region.piece.heading, ...region.piece.blocks]) === "") {
    return { kind: "none" }
  }
  const { section, piece, regionId } = region
  return {
    kind: "leaves",
    regionId,
    heading: piece.heading,
    headingText: section.heading.trim(),
    entries: section.entries.flatMap(({ leafId }, index): readonly MainViewSurfaceEntry[] => {
      const markdown = piece.blocks[index] ?? ""
      if (markdown === "") {
        return []
      }
      return leafId === undefined ? [{ kind: "text", markdown }] : [{ kind: "leaf", id: leafId }]
    }),
  }
}
