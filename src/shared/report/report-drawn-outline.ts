// `components` から、画面に描く節の並びを導く。記録にもイベントにも持たず、描くたびに導く。
// 描く順は図 → 整形した本文の節 → 振り返り。節の塊には、元になった葉の ID を添える。

import type { A2uiReportComponent } from "./a2ui-report-catalog.ts"
import type { ReportBlock, ReportSection } from "./report-block.ts"
import {
  outlineLeafBlock,
  type ReportOutlineLeaf,
  reportOutline,
  reportRetrospectiveHeadOf,
} from "./report-outline.ts"
import { retrospectiveDraftsLine } from "./report-retrospective.ts"
import { tidyReportOutline } from "./report-tidy.ts"

/** `body` は本文の節だけ、`whole` は図と振り返りも描く。 */
export type DrawnScope = "body" | "whole"

/** 節の塊1つ。`leafId` が無いのは、葉に由来しない塊（振り返りの要約とドラフトの行）。 */
export type DrawnEntry = {
  readonly leafId: string | undefined
  readonly block: ReportBlock
}

export type DrawnSection = {
  readonly role: "figure" | "body" | "retrospective"
  /** 本文の節になった根の子の部品の ID。図・振り返りは無い。 */
  readonly componentId: string | undefined
  readonly heading: string
  readonly entries: readonly DrawnEntry[]
  /** `entries` の塊を並べた節。組み立ての関数がこの形を受ける。 */
  readonly section: ReportSection
}

export type DrawnReport = {
  readonly sections: readonly DrawnSection[]
  /** 整形で落ちた葉の ID。 */
  readonly droppedLeafIds: ReadonlySet<string>
}

export function drawnReportOf(
  components: readonly A2uiReportComponent[],
  conclusion: string,
  scope: DrawnScope,
): DrawnReport {
  const outline = reportOutline(components)
  const tidied = tidyReportOutline({ conclusion, outline })
  const figure = scope === "whole" ? entriesOfLeaves(tidied.outline.figure) : []
  const body = tidied.outline.sections.flatMap((section) => {
    const entries = entriesOfLeaves(section.leaves)
    return entries.length === 0
      ? []
      : [
          drawnSection(
            "body",
            section.kind === "section" ? section.heading : "",
            entries,
            section.componentId,
          ),
        ]
  })
  return {
    sections: [
      ...(figure.length === 0 ? [] : [drawnSection("figure", "", figure, undefined)]),
      ...body,
      ...(scope === "whole" ? retrospectiveOf(components, tidied.outline.retrospective) : []),
    ],
    droppedLeafIds: tidied.droppedLeafIds,
  }
}

function retrospectiveOf(
  components: readonly A2uiReportComponent[],
  leaves: readonly ReportOutlineLeaf[],
): readonly DrawnSection[] {
  const { summary, drafts } = reportRetrospectiveHeadOf(components)
  if (summary === "" && drafts.length === 0 && leaves.length === 0) {
    return []
  }
  return [
    drawnSection(
      "retrospective",
      "振り返り",
      [
        synthesized(summary),
        ...entriesOfLeaves(leaves),
        ...(drafts.length === 0 ? [] : [synthesized(retrospectiveDraftsLine(drafts))]),
      ],
      undefined,
    ),
  ]
}

function synthesized(text: string): DrawnEntry {
  return { leafId: undefined, block: { kind: "text", text, fold: "", aside: "" } }
}

function entriesOfLeaves(leaves: readonly ReportOutlineLeaf[]): readonly DrawnEntry[] {
  return leaves.flatMap((leaf) => {
    const block = outlineLeafBlock(leaf)
    return block === undefined ? [] : [{ leafId: leaf.id, block }]
  })
}

function drawnSection(
  role: DrawnSection["role"],
  heading: string,
  entries: readonly DrawnEntry[],
  componentId: string | undefined,
): DrawnSection {
  return {
    role,
    componentId,
    heading,
    entries,
    section: { heading, shapeTag: "unspecified", blocks: entries.map((entry) => entry.block) },
  }
}
