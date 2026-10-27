// `report` の塊の使われ方の記録1行ぶんの中身。
// 持つのはそのレポートに出た名前の集合と数だけで、塊の中身・逃げ道の文字は入れない。

import { groupBy, isPlainObject } from "remeda"

import { readGraphSource } from "../../../shared/report/graph-source.ts"
import type {
  ReportArgumentChars,
  ReportArgumentField,
} from "../../../shared/report/report-argument-size.ts"
import { tableRowCells } from "../../../shared/report/report-block-comparison.ts"
import type { ReportBlock, ReportSection } from "../../../shared/report/report-block.ts"
import type { ReportCheck } from "../../../shared/report/report-check.ts"
import { drawnSectionsOf } from "../../../shared/report/report-retrospective.ts"
import { isForbiddenBlock } from "../../../shared/report/report-shape-tag.ts"
import type { ReportGenre, ReportTaskOutcome } from "../../../shared/report/report-task.ts"
import type { ToolErrorField } from "../../../shared/report/tool-error-field.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { markdownTreeOf, nodesInOrder } from "./markdown-tree.ts"
import type { ReportRejectionMode } from "./rejection-mode.ts"
import { mermaidKind, mermaidSourcesInSections } from "./report-figure-fault.ts"
import { reportImagePaths } from "./report-image-shelf.ts"
import {
  containedNotationsInSections,
  escapeNotationsInSections,
  type EscapeNotation,
  type MarkdownNotation,
  notationsInSections,
} from "./report-markdown-notation.ts"
import type {
  ForbiddenShapeBlockUsage,
  ReportFigureUsage,
  ReportShapeTagUsage,
} from "./report-usage-record.ts"

export type ReportUsageEntry = {
  readonly at: number
  readonly sessionId: string
  /** `figure` の欄の種類と、`none` の理由。 */
  readonly figure: ReportFigureUsage
  /** 節の札と、札が許さない塊を使った節・組の数。 */
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
  readonly unknownBlockCount: number
  /** その回に出た `list` の `style`（重複無し）。 */
  readonly listStyles: readonly string[]
  /** その回に出た `mermaid` の図の種類（ソースの最初の語。重複無し。`figure` の図を含む）。 */
  readonly mermaidKinds: readonly string[]
  /** `files` の塊に `modified` の項目があるか。 */
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
  const drawnSections = drawnSectionsOf(event)
  return {
    at,
    sessionId,
    figure:
      event.figure.kind === "none"
        ? { figureKind: "none", noneReason: event.figure.reason }
        : { figureKind: event.figure.kind },
    shapeTags: shapeTagUsageOf(event.sections),
    blockKinds: blockKindsOf(drawnSections),
    blockFields: blockFieldsOf(drawnSections),
    notations: notationsInSections(event.sections),
    containedNotations: containedNotationsInSections(event.sections),
    escapeNotations: escapeNotationsInSections(event.sections),
    unknownBlockCount: event.unknownBlockCount,
    listStyles: listStylesOf(drawnSections),
    mermaidKinds: [...new Set(mermaidSourcesInSections(drawnSections).map(mermaidKind))],
    hasModifiedFiles: blocksOf(event.sections).some(
      (block) => block.kind === "files" && block.items.some((item) => item.change === "modified"),
    ),
    hasBeforeAfterOrImage: blocksOf(drawnSections).some(
      (block) => block.kind === "beforeAfter" || block.kind === "image",
    ),
    forTask: event.task.kind === "task",
    hasFigure: blocksOf(drawnSections).some(
      (block) =>
        FIGURE_KINDS.includes(block.kind) ||
        (block.kind === "beforeAfter" &&
          [block.before, block.after].some((side) => FIGURE_KINDS.includes(side.kind))),
    ),
    readImageWithoutImageBlock: mainReadImageFile && reportImagePaths(drawnSections).length === 0,
    emphasisCount: blocksOf(drawnSections).reduce(
      (total, block) => total + emphasisCountOf(block),
      0,
    ),
    ...graphCountsOf(blocksOf(drawnSections)),
    ...howToVerifyUsageOf(event.checks),
    taskGenre: event.task.kind === "task" ? event.task.genre : "none",
    taskOutcome: event.task.kind === "task" ? event.task.outcome : "none",
    hasFavor: event.favor.trim() !== "",
    hasSourceReference: blocksOf(event.sections).some(hasSourceReference),
    shortTable: blocksOf(drawnSections).some(
      (block) => block.kind === "table" && block.rows.length <= 2,
    ),
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

function hasSourceReference(block: ReportBlock): boolean {
  return block.kind === "code"
    ? block.path.trim() !== ""
    : writtenTextsOf(block).some((text) => SOURCE_REFERENCE.test(text))
}

function writtenTextsOf(block: ReportBlock): readonly string[] {
  switch (block.kind) {
    case "text":
    case "note":
      return [block.text]
    case "list":
      return block.items.map((item) => item.text)
    case "table":
      return block.rows.flatMap((row) =>
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
    case "markdown":
      return [block.markdown]
    default:
      return []
  }
}

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g

/** 文中の数（数字の連なり）の数。インラインコードの中は数えない。 */
function numberCountOutsideCode(markdown: string): number {
  return nodesInOrder(markdownTreeOf(markdown)).reduce(
    (total, node) =>
      total + (node.type === "text" ? (node.value.match(NUMBER_PATTERN)?.length ?? 0) : 0),
    0,
  )
}

const INLINE_CODE = /(`+)[\s\S]*?\1/g

const EMPHASIS_PAIR = /\*\*[\s\S]+?\*\*/g

function emphasisCountIn(text: string): number {
  return text.replace(INLINE_CODE, "").match(EMPHASIS_PAIR)?.length ?? 0
}

function emphasisCountOf(block: ReportBlock): number {
  switch (block.kind) {
    case "text":
      return emphasisCountIn(block.text)
    case "list":
      return block.items.reduce((total, item) => total + emphasisCountIn(item.text), 0)
    case "table":
      return block.rows.reduce(
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
  blocks: readonly ReportBlock[],
): Pick<ReportUsageEntry, "graphEdgeCount" | "graphUnlabeledEdgeCount" | "graphNodeCount"> {
  const readings = blocks.flatMap((block) =>
    block.kind === "graph" ? [readGraphSource(block.source)] : [],
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

function shapeTagUsageOf(sections: readonly ReportSection[]): ReportShapeTagUsage {
  const forbiddenBySection = sections.map(({ shapeTag, blocks }) =>
    shapeTag === "unspecified"
      ? []
      : blocks
          .filter((block) => isForbiddenBlock(shapeTag, block))
          .map((block) => ({ shapeTag, blockKind: block.kind })),
  )
  return {
    sectionShapeTags: sections.map((section) => section.shapeTag),
    sectionBlockKinds: sections.map((section) => [
      ...new Set(section.blocks.map((block) => block.kind)),
    ]),
    forbiddenShapeSectionCount: forbiddenBySection.filter((uses) => uses.length > 0).length,
    forbiddenShapeBlocks: Object.values(
      groupBy(forbiddenBySection.flat(), (use) => `${use.shapeTag}/${use.blockKind}`),
    ).map(([first, ...rest]): ForbiddenShapeBlockUsage => ({ ...first, count: rest.length + 1 })),
  }
}

function listStylesOf(sections: readonly ReportSection[]): readonly string[] {
  return [
    ...new Set(blocksOf(sections).flatMap((block) => (block.kind === "list" ? [block.style] : []))),
  ]
}

function blocksOf(sections: readonly ReportSection[]): readonly ReportBlock[] {
  return sections.flatMap((section) => section.blocks)
}

function blockKindsOf(sections: readonly ReportSection[]): readonly string[] {
  return [...new Set(sections.flatMap((section) => section.blocks.map((block) => block.kind)))]
}

function blockFieldsOf(sections: readonly ReportSection[]): readonly ReportBlockField[] {
  const blocks = blocksOf(sections)
  return REPORT_BLOCK_FIELDS.filter((field) => blocks.some((block) => hasField(block, field)))
}

function hasField(block: ReportBlock, field: ReportBlockField): boolean {
  switch (field) {
    case "tableChange":
      return (
        block.kind === "table" &&
        block.rows.some((row) =>
          tableRowCells(row).some((cell) => typeof cell === "object" && "from" in cell),
        )
      )
    case "tableRest":
      return block.kind === "table" && block.rest.trim() !== ""
    case "statsBefore":
      return block.kind === "stats" && block.items.some((item) => item.before.trim() !== "")
    case "statsTotal":
      return block.kind === "stats" && block.items.some((item) => item.total.trim() !== "")
    case "statsSeries":
      return block.kind === "stats" && block.items.some((item) => item.series.length > 0)
    case "statsBetter":
      return block.kind === "stats" && block.items.some((item) => item.better !== "")
    case "listLabel":
      return block.kind === "list" && block.items.some((item) => item.label.trim() !== "")
    case "listFlow":
      return block.kind === "list" && block.style === "flow"
    case "imageNotes":
      return block.kind === "image" && block.notes.length > 0
    case "codeMarks":
      return block.kind === "code" && block.marks.length > 0
    case "blockAside":
      return block.aside.trim() !== ""
    case "beforeAfterRegion":
      return (
        block.kind === "beforeAfter" &&
        [block.before, block.after].some(
          (side) => side.kind === "image" && side.region !== undefined,
        )
      )
  }
}
