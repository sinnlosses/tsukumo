// `components` から、規約の検査が読む節・図・振り返りの葉を取り出す。
// 葉は `a2uiLeafIds` と同じ平らな並びで、配置の部品（Row・Column・Card・Tabs）の中の葉も外側の節へ並び順に入る。

import { omit } from "remeda"

import { type A2uiReportComponent, LEAF_COMPONENT_KINDS } from "./a2ui-report-catalog.ts"
import {
  A2UI_ROOT_ID,
  a2uiLeafIds,
  a2uiLeafKind,
  a2uiOutlineSections,
  a2uiPartsById,
} from "./a2ui-report-outline.ts"
import type { ReportPlot } from "./figure-grammar.ts"
import {
  parseReportBlocks,
  type RecordedReportFigure,
  type ReportBlock,
  reportFigureSchema,
} from "./report-block.ts"
import type { ReportTimeline } from "./timeline-block.ts"

export type ReportOutlineLeaf = Extract<
  A2uiReportComponent,
  { readonly component: keyof typeof LEAF_COMPONENT_KINDS }
>

/**
 * `section` は見出しつきの `Section`、`loose` は見出しの無い節（`Section` でない根の子）。
 * `componentId` は節になった根の子の部品の ID。
 */
export type ReportOutlineSection =
  | {
      readonly kind: "section"
      readonly componentId: string
      readonly heading: string
      readonly leaves: readonly ReportOutlineLeaf[]
    }
  | {
      readonly kind: "loose"
      readonly componentId: string
      readonly leaves: readonly ReportOutlineLeaf[]
    }

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
        ? {
            kind: "section",
            componentId: section.componentId,
            heading: section.heading,
            leaves: leavesOf(section.leafIds),
          }
        : { kind: "loose", componentId: section.componentId, leaves: leavesOf(section.leafIds) },
    ),
    figure: leavesOf(root.figure === undefined ? [] : [root.figure]),
    retrospective: leavesOf(root.retrospective?.blocks ?? []),
  }
}

export function outlineLeafBlock(leaf: ReportOutlineLeaf): ReportBlock | undefined {
  return parseReportBlocks([
    { kind: LEAF_COMPONENT_KINDS[leaf.component], ...omit(leaf, ["id", "component"]) },
  ])[0]
}

export function sectionLeaves(outline: ReportOutline): readonly ReportOutlineLeaf[] {
  return outline.sections.flatMap((section) => section.leaves)
}

/** 画面に描く葉の並び（図 → 本文の節 → 振り返り）。 */
export function drawnLeaves(outline: ReportOutline): readonly ReportOutlineLeaf[] {
  return [...outline.figure, ...sectionLeaves(outline), ...outline.retrospective]
}

/** 葉のうち `Plot` を、`ReportPlot` の形（`kind` つき）にして並び順に返す。 */
export function plotsOfLeaves(leaves: readonly ReportOutlineLeaf[]): readonly ReportPlot[] {
  return leaves.flatMap((leaf): readonly ReportPlot[] =>
    leaf.component === "Plot" ? [{ kind: "plot", ...leaf }] : [],
  )
}

/** `Report.retrospective` の要約と積んだドラフト（葉の `blocks` は含めない）。欄が無ければ空。 */
export function reportRetrospectiveHeadOf(components: readonly A2uiReportComponent[]): {
  readonly summary: string
  readonly drafts: readonly string[]
} {
  const root = a2uiPartsById(components).get(A2UI_ROOT_ID)
  return root?.component === "Report" && root.retrospective !== undefined
    ? { summary: root.retrospective.summary, drafts: root.retrospective.drafts }
    : { summary: "", drafts: [] }
}

/** 葉のうち `Timeline` を、`ReportTimeline` の形（`kind` つき）にして並び順に返す。 */
export function timelinesOfLeaves(leaves: readonly ReportOutlineLeaf[]): readonly ReportTimeline[] {
  return leaves.flatMap((leaf): readonly ReportTimeline[] =>
    leaf.component === "Timeline" ? [{ kind: "timeline", ...leaf }] : [],
  )
}

/**
 * 図の申告。図の葉があればその種類、無ければ `figureNone` の理由つきの `none`、
 * どちらも無ければ `unrecorded`。
 */
export function reportFigureOf(
  components: readonly A2uiReportComponent[],
): ReportFigureDeclaration {
  const root = a2uiPartsById(components).get(A2UI_ROOT_ID)
  if (root?.component !== "Report") {
    return UNRECORDED_FIGURE
  }
  const [leaf] = reportOutline(components).figure
  if (leaf !== undefined) {
    return figureOfLeaf(leaf)
  }
  return root.figureNone === undefined
    ? UNRECORDED_FIGURE
    : { kind: "none", reason: root.figureNone }
}

type PlacedFigureKind = Exclude<RecordedReportFigure["kind"], "none">

export type ReportFigureDeclaration =
  | { readonly kind: PlacedFigureKind }
  | Extract<RecordedReportFigure, { readonly kind: "none" }>

const PLACED_FIGURE_KINDS: ReadonlySet<string> = new Set(
  reportFigureSchema.options.map((option) => option.shape.kind.value),
)

function isPlacedFigureKind(kind: string): kind is PlacedFigureKind {
  return PLACED_FIGURE_KINDS.has(kind)
}

/** `Report.figure` に置けない部品の葉は、スキーマが先に落とすのでここへは来ない。 */
function figureOfLeaf(leaf: ReportOutlineLeaf): ReportFigureDeclaration {
  const kind = LEAF_COMPONENT_KINDS[leaf.component]
  return isPlacedFigureKind(kind) ? { kind } : UNRECORDED_FIGURE
}

const UNRECORDED_FIGURE = {
  kind: "none",
  reason: "unrecorded",
} as const satisfies ReportFigureDeclaration

function isLeafPart(part: A2uiReportComponent): part is ReportOutlineLeaf {
  return a2uiLeafKind(part) !== undefined
}
