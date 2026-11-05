// `report` の記録が持つ部品の一覧を、A2UI の面で描くための値にする。
// 節の有無と `Markdown` の葉の字は、描くセクションの部品の値（`drawnReportOf` と `reportLeafLayoutOf`）から決め、部品の ID に当てる。

import type { A2uiReportComponent } from "../report/a2ui-report-catalog.ts"
import { A2UI_ROOT_ID, a2uiPartsById } from "../report/a2ui-report-outline.ts"
import {
  drawnEntryMarkdown,
  drawnEntryPresence,
  sectionDrawsAnything,
  sectionHeadingMarkdown,
} from "../report/drawn-entry-markdown.ts"
import type { ReportBlock } from "../report/report-block.ts"
import type { DrawnReport, DrawnSection } from "../report/report-drawn-outline.ts"
import type { ReportImageSource } from "../report/report-image-markdown.ts"
import type { LeafValue, ReportLeafLayout } from "../report/report-leaf-value.ts"
import type { WrittenReportView } from "../report/report-static-component-list.ts"
import type {
  MainViewA2uiReport,
  MainViewSurfaceEntry,
  MainViewSurfaceHead,
  MainViewSurfaceLeafRegion,
} from "./main-view-shape.ts"

/**
 * 部品の一覧を、節の欄の ID と `Markdown` の葉ごとの Markdown に当てる。
 * `drawn` は描く節の並び（`drawnReportOf`）で、添字が欄の ID。
 * 根が `Report` でなければ `none`。
 * `layout` は `drawn` の節から導いた値で、`values` を `leafValues` に葉の ID で当てる。
 */
export function a2uiReportView(
  components: readonly A2uiReportComponent[],
  written: WrittenReportView,
  drawn: DrawnReport,
  layout: ReportLeafLayout,
  imageSource: ReportImageSource,
  headWithoutWorkDone: Omit<MainViewSurfaceHead, "workDone">,
  favor: Extract<MainViewA2uiReport, { readonly kind: "surface" }>["favor"],
): MainViewA2uiReport {
  const byId = a2uiPartsById(components)
  const root = byId.get(A2UI_ROOT_ID)
  const head: MainViewSurfaceHead = {
    ...headWithoutWorkDone,
    workDone: root?.component === "Report" ? (root.workDone ?? "").trim() : "",
  }
  if (root?.component !== "Report") {
    return { kind: "none", head, favor }
  }
  const regions: readonly DrawnRegion[] = drawn.sections.map((section, regionId) => ({
    section,
    values: layout.values[regionId] ?? [],
    regionId,
  }))
  const droppedMarkdown = [...drawn.droppedLeafIds].flatMap(
    (leafId): readonly (readonly [string, string])[] =>
      byId.get(leafId)?.component === "Markdown" ? [[leafId, ""]] : [],
  )
  return {
    kind: "surface",
    components,
    written,
    sections: Object.fromEntries(
      regions.flatMap(({ section, values, regionId }) =>
        section.role === "body" && sectionDrawsAnything(section.section, values)
          ? [[section.componentId, { regionId, heading: sectionHeadingMarkdown(section.heading) }]]
          : [],
      ),
    ),
    markdownLeaves: Object.fromEntries([
      ...droppedMarkdown,
      ...regions.flatMap(({ section, values }) =>
        section.entries.flatMap(
          ({ leafId, block }, index): readonly (readonly [string, string])[] => {
            if (leafId === undefined || byId.get(leafId)?.component !== "Markdown") {
              return []
            }
            const value = values[index]
            return [[leafId, value === undefined ? "" : entryMarkdown(block, value)]]
          },
        ),
      ),
    ]),
    figure: leafRegionOf(regions, "figure"),
    retrospective: leafRegionOf(regions, "retrospective"),
    leafValues: Object.fromEntries(
      regions.flatMap(({ section, values }) =>
        section.entries.flatMap(({ leafId }, index): readonly (readonly [string, LeafValue])[] => {
          const value = values[index]
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
  readonly values: readonly LeafValue[]
  readonly regionId: number
}

/** 中身の塊が残らない欄は `none`。Markdown が空になる塊（欄外注に寄せた覚え書きなど）は並べない。 */
function leafRegionOf(
  regions: readonly DrawnRegion[],
  role: "figure" | "retrospective",
): MainViewSurfaceLeafRegion {
  const region = regions.find(({ section }) => section.role === role)
  if (region === undefined || !sectionDrawsAnything(region.section.section, region.values)) {
    return { kind: "none" }
  }
  const { section, values, regionId } = region
  return {
    kind: "leaves",
    regionId,
    heading: sectionHeadingMarkdown(section.heading),
    headingText: section.heading.trim(),
    entries: section.entries.flatMap(
      ({ leafId, block }, index): readonly MainViewSurfaceEntry[] => {
        const value = values[index]
        if (value === undefined || drawnEntryPresence(block, value) === "empty") {
          return []
        }
        return leafId === undefined
          ? [{ kind: "text", markdown: entryMarkdown(block, value) }]
          : [{ kind: "leaf", id: leafId }]
      },
    ),
  }
}

/** 字で描く塊（markdown・text）の Markdown。ほかの種類は空文字。 */
function entryMarkdown(block: ReportBlock, value: LeafValue): string {
  return block.kind === "markdown" || block.kind === "text" ? drawnEntryMarkdown(block, value) : ""
}
