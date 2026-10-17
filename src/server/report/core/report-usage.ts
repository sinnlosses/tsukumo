// `report` の塊の使われ方の記録1行ぶんの中身。
// 持つのはそのレポートに出た名前の集合と数だけで、塊の中身・逃げ道の文字は入れない。

import { isPlainObject } from "remeda"

import { readGraphSource } from "../../../shared/report/graph-source.ts"
import {
  type ReportBlock,
  type ReportSection,
  sectionsWithFigure,
} from "../../../shared/report/report-block.ts"
import type { ReportCheck } from "../../../shared/report/report-check.ts"
import type { ReportGenre, ReportTaskOutcome } from "../../../shared/report/report-task.ts"
import type { ReportFigureUsage } from "../../../shared/report/report-usage-record.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { reportImagePaths } from "./report-image-shelf.ts"
import {
  containedNotationsInSections,
  escapeNotationsInSections,
  type EscapeNotation,
  type MarkdownNotation,
  notationsInSections,
} from "./report-markdown-notation.ts"

export type ReportUsageEntry = {
  readonly at: number
  readonly sessionId: string
  /** `figure` の欄の種類と、`none` の理由。 */
  readonly figure: ReportFigureUsage
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
  /** `checks` に `unverified` の行が1つでもあるか。 */
  readonly hasUnverifiedCheck: boolean
  /** `unverified` の行があり、その全部の `howToVerify` が空でないか。 */
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
}

const FIGURE_KINDS: readonly string[] = ["image", "mermaid", "graph", "svg"]

const IMAGE_FILE_EXTENSIONS: readonly string[] = [".png", ".jpg", ".jpeg", ".gif", ".webp"]

/**
 * 数える塊の欄。外す基準（直近4週間で0回）を塊の種類と同じく当てるため、既定の値でない欄が出たかを持つ。
 * 表のセルの `from` / `to`・表の `rest`・`stats` の `before` / `total` / `series` / `better`・`list` の `label`・`list` の `flow`・`dimension` の `before`・`image` の `notes`・`code` の `marks`・塊の `aside`。
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
  "dimensionBefore",
  "imageNotes",
  "codeMarks",
  "blockAside",
] as const satisfies readonly string[]

export type ReportBlockField = (typeof REPORT_BLOCK_FIELDS)[number]

/** 差し戻した `report` 1回の記録。種類の名前だけで、本文も差し戻しの文面も持たない。 */
export type ReportRejectionEntry = {
  readonly at: number
  readonly sessionId: string
  readonly reasons: readonly string[]
}

/** 書けなくても例外を投げない。 */
export type ReportUsageLog = {
  readonly append: (entry: ReportUsageEntry) => void
  readonly appendRejection: (entry: ReportRejectionEntry) => void
}

/** 描いた（差し戻されなかった）`report` から、記録1行ぶんの中身を作る。`mainReadImageFile` は、このターンにメインが画像のファイルを `Read` したか。 */
export function reportUsageEntryOf(
  event: Extract<SessionEvent, { readonly kind: "report" }>,
  sessionId: string,
  at: number,
  mainReadImageFile: boolean,
): ReportUsageEntry {
  const drawnSections = sectionsWithFigure(event.figure, event.sections)
  return {
    at,
    sessionId,
    figure:
      event.figure.kind === "none"
        ? { figureKind: "none", noneReason: event.figure.reason }
        : { figureKind: event.figure.kind },
    blockKinds: blockKindsOf(drawnSections),
    blockFields: blockFieldsOf(drawnSections),
    notations: notationsInSections(event.sections),
    containedNotations: containedNotationsInSections(event.sections),
    escapeNotations: escapeNotationsInSections(event.sections),
    unknownBlockCount: event.unknownBlockCount,
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
        row.flatMap((cell) =>
          typeof cell === "string" ? [cell] : "from" in cell ? [cell.from, cell.to] : [cell.text],
        ),
      )
    case "markdown":
      return [block.markdown]
    default:
      return []
  }
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
          row.reduce(
            (rowTotal, cell) =>
              rowTotal +
              (typeof cell === "string"
                ? emphasisCountIn(cell)
                : "from" in cell
                  ? emphasisCountIn(cell.from) + emphasisCountIn(cell.to)
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
  const unverified = checks.filter((check) => check.status === "unverified")
  return {
    hasUnverifiedCheck: unverified.length > 0,
    hasHowToVerify:
      unverified.length > 0 && unverified.every((check) => check.howToVerify.trim() !== ""),
  }
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
        block.rows.some((row) => row.some((cell) => typeof cell === "object" && "from" in cell))
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
    case "dimensionBefore":
      return block.kind === "dimension" && block.parts.some((part) => part.before.trim() !== "")
    case "imageNotes":
      return block.kind === "image" && block.notes.length > 0
    case "codeMarks":
      return block.kind === "code" && block.marks.length > 0
    case "blockAside":
      return block.aside.trim() !== ""
  }
}
