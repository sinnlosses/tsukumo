// `components` から、規約の検査が読む節・図・振り返りの葉を取り出す。
// 葉は `a2uiLeafIds` と同じ平らな並びで、配置の部品（Row・Column・Card・Tabs）の中の葉も外側の節へ並び順に入る。

import type { A2uiReportComponent, LEAF_COMPONENT_KINDS } from "./a2ui-report-catalog.ts"
import {
  A2UI_ROOT_ID,
  a2uiLeafIds,
  a2uiLeafKind,
  a2uiOutlineSections,
  a2uiPartsById,
} from "./a2ui-report-outline.ts"

export type ReportOutlineLeaf = Extract<
  A2uiReportComponent,
  { readonly component: keyof typeof LEAF_COMPONENT_KINDS }
>

/** `section` は見出しつきの `Section`、`loose` は見出しの無い節（`Section` でない根の子）。 */
export type ReportOutlineSection =
  | {
      readonly kind: "section"
      readonly heading: string
      readonly leaves: readonly ReportOutlineLeaf[]
    }
  | { readonly kind: "loose"; readonly leaves: readonly ReportOutlineLeaf[] }

export type ReportOutline = {
  readonly sections: readonly ReportOutlineSection[]
  /** `Report.figure` の葉。無ければ空、あれば 1 つ。 */
  readonly figure: readonly ReportOutlineLeaf[]
  readonly retrospective: readonly ReportOutlineLeaf[]
}

const EMPTY_OUTLINE = {
  sections: [],
  figure: [],
  retrospective: [],
} as const satisfies ReportOutline

export function reportOutline(components: readonly A2uiReportComponent[]): ReportOutline {
  const byId = a2uiPartsById(components)
  const root = byId.get(A2UI_ROOT_ID)
  if (root?.component !== "Report") {
    return EMPTY_OUTLINE
  }
  const leavesOf = (ids: readonly string[]): readonly ReportOutlineLeaf[] =>
    a2uiLeafIds(ids, byId).flatMap((id) => {
      const part = byId.get(id)
      return part !== undefined && isLeafPart(part) ? [part] : []
    })
  return {
    sections: a2uiOutlineSections(root, byId).map((section) =>
      section.kind === "section"
        ? { kind: "section", heading: section.heading, leaves: leavesOf(section.leafIds) }
        : { kind: "loose", leaves: leavesOf(section.leafIds) },
    ),
    figure: leavesOf(root.figure === undefined ? [] : [root.figure]),
    retrospective: leavesOf(root.retrospective?.blocks ?? []),
  }
}

function isLeafPart(part: A2uiReportComponent): part is ReportOutlineLeaf {
  return a2uiLeafKind(part) !== undefined
}
