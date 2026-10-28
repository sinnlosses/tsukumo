// `report` の塊の使われ方の記録1行ぶんの中身。
// 持つのはそのレポートに出た名前の集合と数だけで、塊の中身・逃げ道の文字は入れない。

import { isPlainObject } from "remeda"

import { LEAF_COMPONENT_KINDS } from "../../../shared/report/a2ui-report-catalog.ts"
import { readGraphSource } from "../../../shared/report/graph-source.ts"
import type {
  ReportArgumentChars,
  ReportArgumentField,
} from "../../../shared/report/report-argument-size.ts"
import { tableRowCells } from "../../../shared/report/report-block-comparison.ts"
import type { ReportCheck } from "../../../shared/report/report-check.ts"
import {
  drawnLeaves,
  type ReportOutlineLeaf,
  reportOutline,
  sectionLeaves,
} from "../../../shared/report/report-outline.ts"
import type { ReportGenre, ReportTaskOutcome } from "../../../shared/report/report-task.ts"
import type { ToolErrorField } from "../../../shared/report/tool-error-field.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { numberCountOutsideCode } from "./number-count.ts"
import type { ReportRejectionMode } from "./rejection-mode.ts"
import { mermaidKind, mermaidSourcesOfLeaves } from "./report-figure-fault.ts"
import { reportImagePaths } from "./report-image-shelf.ts"
import {
  containedNotationsInSections,
  escapeNotationsInSections,
  type EscapeNotation,
  type MarkdownNotation,
  notationKindsInMarkdowns,
  notationsInSections,
} from "./report-markdown-notation.ts"
import type { ReportFigureUsage, ReportShapeTagUsage } from "./report-usage-record.ts"

export type ReportUsageEntry = {
  readonly at: number
  readonly sessionId: string
  /** `figure` の欄の種類と、`none` の理由。 */
  readonly figure: ReportFigureUsage
  /** 節ごとの塊の種類。札は常に `unspecified` で、札が許さない塊の数は空（過去の行の列を残している）。 */
  readonly shapeTags: ReportShapeTagUsage
  /** その回に出た塊の種類（`figure` の図を含む。重複無し）。 */
  readonly blockKinds: readonly string[]
  /** その回に出た塊の欄（`figure` の図を含む。重複無し）。 */
  readonly blockFields: readonly ReportBlockField[]
  /** その回に逃げ道（`markdown` の塊）の外側に出た記法の種類（重複無し）。 */
  readonly notations: readonly MarkdownNotation[]
  /** その回に逃げ道の HTML の容れ物の中に出た記法の種類（重複無し）。 */
  readonly containedNotations: readonly MarkdownNotation[]
  /** その回に逃げ道に出た、塊の無い記法の種類（重複無し）。 */
  readonly escapeNotations: readonly EscapeNotation[]
  /** その回に使った `a2ui` の部品の名前（重複無し）。 */
  readonly componentNames: readonly string[]
  /** その回の `Markdown` の部品の中身に出た記法の種類（重複無し）。 */
  readonly markdownNotationKinds: readonly string[]
  readonly unknownBlockCount: number
  /** `body` の型つきフェンスのうち、読めずに素のコードブロックへ落としたものの数。 */
  readonly brokenFenceCount: number
  /** その回に出た `list` の `style`（重複無し）。 */
  readonly listStyles: readonly string[]
  /** その回に出た `mermaid` の図の種類（ソースの最初の語。重複無し。`figure` の図を含む）。 */
  readonly mermaidKinds: readonly string[]
  /** 常に false。旧い記録との互換のために欄を残す。 */
  readonly hasModifiedFiles: boolean
  /** `beforeAfter` か `image` の塊が1つでもあるか（`figure` を含む）。 */
  readonly hasBeforeAfterOrImage: boolean
  /** `task` を渡した最終レポートか。 */
  readonly forTask: boolean
  /** 段1の図（`image`・`mermaid`・`graph`・`svg`。`beforeAfter` の側と `figure` を含む）が1つでもあるか。 */
  readonly hasFigure: boolean
  /** このターンにメインが画像のファイルを `Read` したのに `image` の塊（`beforeAfter` の側と `figure` を含む）が無いか。 */
  readonly readImageWithoutImageBlock: boolean
  /** `text` の塊の本文・`list` の項目の text・表のセルに出た強調の対の数の合計。インラインコードの中は数えない。 */
  readonly emphasisCount: number
  /** `graph` の辺の数の合計。 */
  readonly graphEdgeCount: number
  /** `graph` の辺のうちラベルの無いものの数の合計。 */
  readonly graphUnlabeledEdgeCount: number
  /** `graph` の節点数。1レポートに複数あれば最大。 */
  readonly graphNodeCount: number
  /** `checks` に `unobserved` の行が1つでもあるか。 */
  readonly hasUnverifiedCheck: boolean
  /** `unobserved` の行があり、その全部の `howToVerify` が空でないか。 */
  readonly hasHowToVerify: boolean
  /** `task` の報告の種類。`task` の無いレポートは `none`。 */
  readonly taskGenre: ReportGenre | "unspecified" | "none"
  /** `task` の終わり方。`task` の無いレポートは `none`。 */
  readonly taskOutcome: ReportTaskOutcome | "none"
  /** `favor` が空でないか。 */
  readonly hasFavor: boolean
  /** `text` の本文・`list` の項目・表のセル・`note` の本文・`markdown` の中身に URL か `path:line` があるか、`code` の塊に `path` があるか。 */
  readonly hasSourceReference: boolean
  /** 行が2つ以下の表が1つでもあるか。 */
  readonly shortTable: boolean
  /** `keyFigures` が1つ以上あるか（引き継いだものを含む）。 */
  readonly hasKeyFigures: boolean
  /** `keyFigures` が無いのに、結論の文にインラインコードの外の数が3つ以上あるか。 */
  readonly conclusionNumbersWithoutKeyFigures: boolean
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
 * - beforeAfterRegion: `beforeAfter` の画像の側の `region`
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
  "beforeAfterRegion",
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
  event: Extract<SessionEvent, { readonly kind: "report" }>,
  sessionId: string,
  at: number,
  mainReadImageFile: boolean,
): ReportUsageEntry {
  const outline = reportOutline(event.components)
  const drawn = drawnLeaves(outline)
  const own = sectionLeaves(outline)
  return {
    at,
    sessionId,
    figure:
      event.figure.kind === "none"
        ? { figureKind: "none", noneReason: event.figure.reason }
        : { figureKind: event.figure.kind },
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
    componentNames: [...new Set(event.components.map((part) => part.component))],
    markdownNotationKinds: notationKindsInMarkdowns(
      event.components.flatMap((part) => (part.component === "Markdown" ? [part.markdown] : [])),
    ),
    unknownBlockCount: event.unknownBlockCount,
    brokenFenceCount: event.brokenFenceCount,
    listStyles: [
      ...new Set(drawn.flatMap((leaf) => (leaf.component === "ItemList" ? [leaf.style] : []))),
    ],
    mermaidKinds: [...new Set(mermaidSourcesOfLeaves(drawn).map(mermaidKind))],
    hasModifiedFiles: false,
    hasBeforeAfterOrImage: drawn.some(
      (leaf) => leaf.component === "BeforeAfter" || leaf.component === "Picture",
    ),
    forTask: event.task.kind === "task",
    hasFigure: drawn.some(
      (leaf) =>
        FIGURE_KINDS.includes(kindOf(leaf)) ||
        (leaf.component === "BeforeAfter" &&
          [leaf.before, leaf.after].some((side) => FIGURE_KINDS.includes(side.kind))),
    ),
    readImageWithoutImageBlock: mainReadImageFile && reportImagePaths(drawn).length === 0,
    emphasisCount: drawn.reduce((total, leaf) => total + emphasisCountOf(leaf), 0),
    ...graphCountsOf(drawn),
    ...howToVerifyUsageOf(event.checks),
    taskGenre: event.task.kind === "task" ? event.task.genre : "none",
    taskOutcome: event.task.kind === "task" ? event.task.outcome : "none",
    hasFavor: event.favor.trim() !== "",
    hasSourceReference: own.some(hasSourceReference),
    shortTable: drawn.some((leaf) => leaf.component === "Table" && leaf.rows.length <= 2),
    hasKeyFigures: event.keyFigures.length > 0,
    conclusionNumbersWithoutKeyFigures:
      event.keyFigures.length === 0 && numberCountOutsideCode(event.conclusion) >= 3,
    argumentChars: event.argumentChars,
    inheritedFields: event.inheritedFields,
  }
}

/** メインが画像のファイルを `Read` した呼び出しか。パスは返さない。 */
export function isMainImageFileRead(
  event: Extract<SessionEvent, { readonly kind: "tool-started" }>,
): boolean {
  if (event.name !== "Read" || event.parentToolUseId !== undefined) {
    return false
  }
  if (!isPlainObject(event.input) || typeof event.input.file_path !== "string") {
    return false
  }
  const path = event.input.file_path.toLowerCase()
  return IMAGE_FILE_EXTENSIONS.some((extension) => path.endsWith(extension))
}

const SOURCE_REFERENCE = /https?:\/\/\S|[\w./-]+\.\w+:\d+/

function hasSourceReference(leaf: ReportOutlineLeaf): boolean {
  return leaf.component === "Code"
    ? leaf.path.trim() !== ""
    : writtenTextsOf(leaf).some((text) => SOURCE_REFERENCE.test(text))
}

function writtenTextsOf(leaf: ReportOutlineLeaf): readonly string[] {
  switch (leaf.component) {
    case "Paragraph":
    case "Note":
      return [leaf.text]
    case "ItemList":
      return leaf.items.map((item) => item.text)
    case "Table":
      return leaf.rows.flatMap((row) =>
        tableRowCells(row).flatMap((cell) =>
          typeof cell === "string"
            ? [cell]
            : "from" in cell
              ? [cell.from, cell.to]
              : "tag" in cell
                ? [cell.tag]
                : [cell.text],
        ),
      )
    case "Markdown":
      return [leaf.markdown]
    default:
      return []
  }
}

const INLINE_CODE = /(`+)[\s\S]*?\1/g

const EMPHASIS_PAIR = /\*\*[\s\S]+?\*\*/g

function emphasisCountIn(text: string): number {
  return text.replace(INLINE_CODE, "").match(EMPHASIS_PAIR)?.length ?? 0
}

function emphasisCountOf(leaf: ReportOutlineLeaf): number {
  switch (leaf.component) {
    case "Paragraph":
      return emphasisCountIn(leaf.text)
    case "ItemList":
      return leaf.items.reduce(
        (total, item) => total + emphasisCountIn(item.text) + emphasisCountIn(item.branch),
        0,
      )
    case "Table":
      return leaf.rows.reduce(
        (total, row) =>
          total +
          tableRowCells(row).reduce(
            (rowTotal, cell) =>
              rowTotal +
              (typeof cell === "string"
                ? emphasisCountIn(cell)
                : "from" in cell
                  ? emphasisCountIn(cell.from) + emphasisCountIn(cell.to)
                  : "tag" in cell
                    ? emphasisCountIn(cell.tag)
                    : emphasisCountIn(cell.text)),
            0,
          ),
        0,
      )
    default:
      return 0
  }
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

function howToVerifyUsageOf(
  checks: readonly ReportCheck[],
): Pick<ReportUsageEntry, "hasUnverifiedCheck" | "hasHowToVerify"> {
  const unobserved = checks.filter((check) => check.status === "unobserved")
  return {
    hasUnverifiedCheck: unobserved.length > 0,
    hasHowToVerify:
      unobserved.length > 0 && unobserved.every((check) => check.howToVerify.trim() !== ""),
  }
}

/** 今までの塊の `kind` 名で数える。 */
function kindOf(leaf: ReportOutlineLeaf): string {
  return LEAF_COMPONENT_KINDS[leaf.component]
}

function kindsOf(leaves: readonly ReportOutlineLeaf[]): readonly string[] {
  return [...new Set(leaves.map(kindOf))]
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
    case "beforeAfterRegion":
      return (
        leaf.component === "BeforeAfter" &&
        [leaf.before, leaf.after].some((side) => side.kind === "image" && side.region !== undefined)
      )
  }
}
