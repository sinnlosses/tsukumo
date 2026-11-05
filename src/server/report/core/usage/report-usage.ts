// `report` の塊の使われ方の記録1行ぶんの中身。
// 持つのはそのレポートに出た名前の集合と数だけで、塊の中身・逃げ道の文字は入れない。

import { isPlainObject, sumBy, unique } from "remeda"

import type { LEAF_COMPONENT_KINDS } from "../../../../shared/report/a2ui-report-catalog.ts"
import { readGraphSource } from "../../../../shared/report/graph-source.ts"
import type {
  ReportArgumentChars,
  ReportArgumentField,
} from "../../../../shared/report/report-argument-size.ts"
import { tableRowCells } from "../../../../shared/report/report-block-comparison.ts"
import type { ReportCheck } from "../../../../shared/report/report-check.ts"
import { componentParts, slotsOf } from "../../../../shared/report/report-expression-slot.ts"
import {
  comparisonSidesOf,
  drawnLeaves,
  outlineLeafKind,
  type ReportOutlineLeaf,
  reportFigureOf,
  reportOutline,
  sectionLeaves,
} from "../../../../shared/report/report-outline.ts"
import { staticReportComponents } from "../../../../shared/report/report-static-component-list.ts"
import type { ReportGenre, ReportTaskOutcome } from "../../../../shared/report/report-task.ts"
import type { ToolErrorField } from "../../../../shared/report/tool-error-field.ts"
import type {
  ReportCalledEvent,
  ToolStartedEvent,
} from "../../../../shared/session/session-event.ts"
import { reportImagePaths } from "../image/report-image-shelf.ts"
import { numberCountOutsideCode } from "../rules/draft.ts"
import { mermaidKind, mermaidSourcesOfLeaves } from "../rules/figure/diagram.ts"
import {
  containedNotationsInSections,
  escapeNotationsInSections,
  type EscapeNotation,
  type MarkdownNotation,
  notationKindsInMarkdowns,
  notationsInSections,
} from "../rules/prose/notation.ts"
import type { ReportRejectionMode } from "../rules/rejection-mode.ts"
import type { ReportFigureUsage, ReportShapeTagUsage } from "./report-usage-record.ts"
import { emphasisCountOf, hasSourceReference } from "./report-usage-text.ts"

type ReportLeafKind = (typeof LEAF_COMPONENT_KINDS)[keyof typeof LEAF_COMPONENT_KINDS]

type ReportComponentName = ReportCalledEvent["components"][number]["component"]

type ReportListStyle = Extract<ReportOutlineLeaf, { readonly component: "ItemList" }>["style"]

/** `hasUnverifiedCheck` は `checks` に `unobserved` の行が1つでもあるか。無ければ `howToVerify` の有無は問えない。 */
type ReportVerifyUsage =
  | { readonly hasUnverifiedCheck: false; readonly hasHowToVerify: false }
  | { readonly hasUnverifiedCheck: true; readonly hasHowToVerify: boolean }

/** `forTask` は `task` を渡した最終レポートか。渡さないレポートは報告の種類も終わり方も `none`。 */
type ReportTaskUsage =
  | { readonly forTask: false; readonly taskGenre: "none"; readonly taskOutcome: "none" }
  | {
      readonly forTask: true
      readonly taskGenre: ReportGenre | "unspecified"
      readonly taskOutcome: ReportTaskOutcome
    }

/** `hasKeyFigures` は `keyFigures` が1つ以上あるか（引き継いだものを含む）。あれば結論の数は問わない。 */
type ReportKeyFigureUsage =
  | { readonly hasKeyFigures: true; readonly conclusionNumbersWithoutKeyFigures: false }
  | { readonly hasKeyFigures: false; readonly conclusionNumbersWithoutKeyFigures: boolean }

export type ReportUsageEntry = ReportVerifyUsage &
  ReportTaskUsage &
  ReportKeyFigureUsage & {
    readonly at: number
    readonly sessionId: string
    /** `figure` の欄の種類と、`none` の理由。 */
    readonly figure: ReportFigureUsage
    /** 節ごとの塊の種類。札は常に `unspecified` で、札が許さない塊の数は空（過去の行の列を残している）。 */
    readonly shapeTags: ReportShapeTagUsage
    /** その回に出た塊の種類（`figure` の図を含む。重複無し）。 */
    readonly blockKinds: readonly ReportLeafKind[]
    /** その回に出た塊の欄（`figure` の図を含む。重複無し）。 */
    readonly blockFields: readonly ReportBlockField[]
    /** その回に逃げ道（`markdown` の塊）の外側に出た記法の種類（重複無し）。 */
    readonly notations: readonly MarkdownNotation[]
    /** その回に逃げ道の HTML の容れ物の中に出た記法の種類（重複無し）。 */
    readonly containedNotations: readonly MarkdownNotation[]
    /** その回に逃げ道に出た、塊の無い記法の種類（重複無し）。 */
    readonly escapeNotations: readonly EscapeNotation[]
    /** その回に使った `a2ui` の部品の名前（重複無し）。 */
    readonly componentNames: readonly ReportComponentName[]
    /** その回に置いたつまみ（`ParameterSlider`・`ParameterCheckBox`）の数。書き手が書いたままの一覧で数える。 */
    readonly parameterCount: number
    /** その回の式（`expr`・`format` の呼び出し）を値に持つ props の数。書き手が書いたままの一覧で数える。 */
    readonly expressionPropCount: number
    /** その回の `Markdown` の部品の中身に出た記法の種類（重複無し）。 */
    readonly markdownNotationKinds: readonly string[]
    readonly unknownBlockCount: number
    /** `body` の型つきフェンスのうち、読めずに素のコードブロックへ落としたものの数。 */
    readonly brokenFenceCount: number
    /** その回に出た `list` の `style`（重複無し）。 */
    readonly listStyles: readonly ReportListStyle[]
    /** その回に出た `mermaid` の図の種類（ソースの最初の語。重複無し。`figure` の図を含む）。 */
    readonly mermaidKinds: readonly string[]
    /** 常に false。旧い記録との互換のために欄を残す。 */
    readonly hasModifiedFiles: boolean
    /** `compare` か `image` の塊が1つでもあるか（`figure` を含む）。 */
    readonly hasComparisonOrImage: boolean
    /** 段1の図（`image`・`mermaid`・`graph`・`svg`。`compare` の側と `figure` を含む）が1つでもあるか。 */
    readonly hasFigure: boolean
    /** このターンにメインが画像のファイルを `Read` したのに `image` の塊（`compare` の側と `figure` を含む）が無いか。 */
    readonly readImageWithoutImageBlock: boolean
    /** `text` の塊の本文・`list` の項目の text・表のセルに出た強調の対の数の合計。インラインコードの中は数えない。 */
    readonly emphasisCount: number
    /** `graph` のエッジの数の合計。 */
    readonly graphEdgeCount: number
    /** `graph` のエッジのうちラベルの無いものの数の合計。 */
    readonly graphUnlabeledEdgeCount: number
    /** `graph` のノード数。1レポートに複数あれば最大。 */
    readonly graphNodeCount: number
    /** `favor` が空でないか。 */
    readonly hasFavor: boolean
    /** `text` の本文・`list` の項目・表のセル・`note` の本文・`markdown` の中身に URL か `path:line` があるか、`code` の塊に `path` があるか。 */
    readonly hasSourceReference: boolean
    /** 行が2つ以下の表が1つでもあるか。 */
    readonly shortTable: boolean
    /** 引数の字数。全体と最上位の欄ごと。渡した欄だけを数える。 */
    readonly argumentChars: ReportArgumentChars
    /** 直前に差し戻した呼び出しから引き継いだ欄の名前。 */
    readonly inheritedFields: readonly ReportArgumentField[]
  }

const FIGURE_KINDS: readonly string[] = ["image", "mermaid", "graph", "svg"]

const IMAGE_FILE_EXTENSIONS: readonly string[] = [".png", ".jpg", ".jpeg", ".gif", ".webp"]

/**
 * 数える塊の欄。外す基準（直近4週間で0回）を塊の種類と同じく当てるため、既定の値でない欄が出たかを持つ。
 * - tableChange: 表のセルの `from` / `to`
 * - tableRest: 表の `rest`
 * - statsBefore: `stats` の `before`
 * - statsTotal: `stats` の `total`
 * - statsSeries: `stats` の `series`
 * - statsBetter: `stats` の `better`
 * - listLabel: `list` の `label`
 * - listFlow: `list` の `flow`
 * - imageNotes: `image` の `notes`
 * - codeMarks: `code` の `marks`
 * - blockAside: 塊の `aside`
 * - compareRegion: 見比べの部品（`compare`）の画像の側の `region`
 */
export const REPORT_BLOCK_FIELDS = [
  "tableChange",
  "tableRest",
  "statsBefore",
  "statsTotal",
  "statsSeries",
  "statsBetter",
  "listLabel",
  "listFlow",
  "imageNotes",
  "codeMarks",
  "blockAside",
  "compareRegion",
] as const satisfies readonly string[]

export type ReportBlockField = (typeof REPORT_BLOCK_FIELDS)[number]

/**
 * 条に当たった `report` 1回の記録。種類の名前だけで、本文も差し戻しの文面も持たない。
 * `mode` が `reject` なら差し戻した呼び出し、`count` なら通した呼び出しが当たった数えるだけの条。
 */
export type ReportRejectionEntry = {
  readonly mode: ReportRejectionMode
  readonly at: number
  readonly sessionId: string
  readonly reasons: readonly string[]
  readonly argumentChars: ReportArgumentChars
  readonly inheritedFields: readonly ReportArgumentField[]
  /** 形の検査で落ちた欄。`tool-error` の差し戻し以外は空。 */
  readonly toolErrorFields: readonly ToolErrorField[]
}

/** 差し戻しのあとに同じセッションで届いた次の `report` の呼び出し。受け付けなら `reasons` は空。 */
export type ReportNextCall = {
  readonly reasons: readonly string[]
  readonly chars: number
}

export function nextCallOfAccepted(entry: ReportUsageEntry): ReportNextCall {
  return { reasons: [], chars: entry.argumentChars.total }
}

export function nextCallOfRejected(entry: ReportRejectionEntry): ReportNextCall {
  return { reasons: entry.reasons, chars: entry.argumentChars.total }
}

const RESTATEMENT_OPENINGS = [
  "どういうこと",
  "もう一度",
  "もう一回",
  "どこ",
  "意味が",
  "分からない",
  "わからない",
] as const satisfies readonly string[]

/** 依頼の書き出し(先頭の空白を除いた頭)が聞き直しの語句に当たるか。 */
export function isRestatementRequest(text: string): boolean {
  const opening = text.trimStart()
  return RESTATEMENT_OPENINGS.some((phrase) => opening.startsWith(phrase))
}

/** 受け付けた `report` の直後の依頼1件の記録。聞き直しか否かの真偽だけで、依頼の本文は持たない。 */
export type ReportFollowUpEntry = {
  readonly at: number
  readonly sessionId: string
  readonly restated: boolean
}

/** 書けなくても例外を投げない。 */
export type ReportUsageLog = {
  readonly append: (entry: ReportUsageEntry) => void
  readonly appendRejection: (entry: ReportRejectionEntry) => void
  readonly appendFollowUp: (entry: ReportFollowUpEntry) => void
}

/** 描いた（差し戻されなかった）`report` から、記録1行ぶんの中身を作る。`mainReadImageFile` は、このターンにメインが画像のファイルを `Read` したか。 */
export function reportUsageEntryOf(
  event: ReportCalledEvent,
  sessionId: string,
  at: number,
  mainReadImageFile: boolean,
): ReportUsageEntry {
  const { components } = staticReportComponents(event.components)
  const outline = reportOutline(components)
  const drawn = drawnLeaves(outline)
  const own = sectionLeaves(outline)
  const figure = reportFigureOf(components)
  return {
    at,
    sessionId,
    figure:
      figure.kind === "none"
        ? { figureKind: "none", noneReason: figure.reason }
        : { figureKind: figure.kind },
    shapeTags: {
      sectionShapeTags: outline.sections.map(() => "unspecified"),
      sectionBlockKinds: outline.sections.map((section) => kindsOf(section.leaves)),
      forbiddenShapeSectionCount: 0,
      forbiddenShapeBlocks: [],
    },
    blockKinds: kindsOf(drawn),
    blockFields: REPORT_BLOCK_FIELDS.filter((field) => drawn.some((leaf) => hasField(leaf, field))),
    notations: notationsInSections(outline),
    containedNotations: containedNotationsInSections(outline),
    escapeNotations: escapeNotationsInSections(outline),
    componentNames: unique(event.components.map((part) => part.component)),
    parameterCount: event.components.filter(
      (part) => part.component === "ParameterSlider" || part.component === "ParameterCheckBox",
    ).length,
    expressionPropCount: slotsOf(componentParts(event.components)).length,
    markdownNotationKinds: notationKindsInMarkdowns(
      event.components.flatMap((part) => (part.component === "Markdown" ? [part.markdown] : [])),
    ),
    unknownBlockCount: event.droppedCount,
    brokenFenceCount: event.brokenFenceCount,
    listStyles: unique(
      drawn.flatMap((leaf) => (leaf.component === "ItemList" ? [leaf.style] : [])),
    ),
    mermaidKinds: unique(mermaidSourcesOfLeaves(drawn).map(mermaidKind)),
    hasModifiedFiles: false,
    hasComparisonOrImage: drawn.some(
      (leaf) => leaf.component === "Compare" || leaf.component === "Picture",
    ),
    hasFigure: drawn.some(
      (leaf) =>
        FIGURE_KINDS.includes(kindOf(leaf)) ||
        comparisonSidesOf(leaf).some((side) => FIGURE_KINDS.includes(side.kind)),
    ),
    readImageWithoutImageBlock: mainReadImageFile && reportImagePaths(drawn).length === 0,
    emphasisCount: sumBy(drawn, emphasisCountOf),
    ...graphCountsOf(drawn),
    ...howToVerifyUsageOf(event.checks),
    ...taskUsageOf(event.task),
    hasFavor: event.favor.trim() !== "",
    hasSourceReference: own.some(hasSourceReference),
    shortTable: drawn.some((leaf) => leaf.component === "Table" && leaf.rows.length <= 2),
    ...keyFigureUsageOf(event.keyFigures.length, event.conclusion),
    argumentChars: event.argumentChars,
    inheritedFields: event.inheritedFields,
  }
}

/** メインが画像のファイルを `Read` した呼び出しか。パスは返さない。 */
export function isMainImageFileRead(event: ToolStartedEvent): boolean {
  if (event.name !== "Read" || event.parentToolUseId !== undefined) {
    return false
  }
  if (!isPlainObject(event.input) || typeof event.input.file_path !== "string") {
    return false
  }
  const path = event.input.file_path.toLowerCase()
  return IMAGE_FILE_EXTENSIONS.some((extension) => path.endsWith(extension))
}

function graphCountsOf(
  leaves: readonly ReportOutlineLeaf[],
): Pick<ReportUsageEntry, "graphEdgeCount" | "graphUnlabeledEdgeCount" | "graphNodeCount"> {
  const readings = leaves.flatMap((leaf) =>
    leaf.component === "Graph" ? [readGraphSource(leaf.source)] : [],
  )
  const edges = readings.flatMap((reading) => reading.edges)
  return {
    graphEdgeCount: edges.length,
    graphUnlabeledEdgeCount: edges.filter((edge) => edge.label.trim() === "").length,
    graphNodeCount: Math.max(0, ...readings.map((reading) => reading.nodes.length)),
  }
}

/** `hasHowToVerify` は、`unobserved` の行があり、その全部の `howToVerify` が空でないか。 */
function howToVerifyUsageOf(checks: readonly ReportCheck[]): ReportVerifyUsage {
  const unobserved = checks.filter((check) => check.status === "unobserved")
  return unobserved.length === 0
    ? { hasUnverifiedCheck: false, hasHowToVerify: false }
    : {
        hasUnverifiedCheck: true,
        hasHowToVerify: unobserved.every((check) => check.howToVerify.trim() !== ""),
      }
}

function taskUsageOf(task: ReportCalledEvent["task"]): ReportTaskUsage {
  return task.kind === "task"
    ? { forTask: true, taskGenre: task.genre, taskOutcome: task.outcome }
    : { forTask: false, taskGenre: "none", taskOutcome: "none" }
}

/** `conclusionNumbersWithoutKeyFigures` は、結論の文にインラインコードの外の数が3つ以上あるか。 */
function keyFigureUsageOf(keyFigureCount: number, conclusion: string): ReportKeyFigureUsage {
  return keyFigureCount > 0
    ? { hasKeyFigures: true, conclusionNumbersWithoutKeyFigures: false }
    : {
        hasKeyFigures: false,
        conclusionNumbersWithoutKeyFigures: numberCountOutsideCode(conclusion) >= 3,
      }
}

/** 今までの塊の `kind` 名で数える。 */
function kindOf(leaf: ReportOutlineLeaf): ReportLeafKind {
  return outlineLeafKind(leaf)
}

function kindsOf(leaves: readonly ReportOutlineLeaf[]): readonly ReportLeafKind[] {
  return unique(leaves.map(kindOf))
}

function hasField(leaf: ReportOutlineLeaf, field: ReportBlockField): boolean {
  switch (field) {
    case "tableChange":
      return (
        leaf.component === "Table" &&
        leaf.rows.some((row) =>
          tableRowCells(row).some((cell) => typeof cell === "object" && "from" in cell),
        )
      )
    case "tableRest":
      return leaf.component === "Table" && leaf.rest.trim() !== ""
    case "statsBefore":
      return leaf.component === "Stats" && leaf.items.some((item) => item.before.trim() !== "")
    case "statsTotal":
      return leaf.component === "Stats" && leaf.items.some((item) => item.total.trim() !== "")
    case "statsSeries":
      return leaf.component === "Stats" && leaf.items.some((item) => item.series.length > 0)
    case "statsBetter":
      return leaf.component === "Stats" && leaf.items.some((item) => item.better !== "")
    case "listLabel":
      return leaf.component === "ItemList" && leaf.items.some((item) => item.label.trim() !== "")
    case "listFlow":
      return leaf.component === "ItemList" && leaf.style === "flow"
    case "imageNotes":
      return leaf.component === "Picture" && leaf.notes.length > 0
    case "codeMarks":
      return leaf.component === "Code" && leaf.marks.length > 0
    case "blockAside":
      return leaf.aside.trim() !== ""
    case "compareRegion":
      return comparisonSidesOf(leaf).some(
        (side) => side.kind === "image" && side.region !== undefined,
      )
  }
}
