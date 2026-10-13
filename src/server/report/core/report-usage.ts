// `report` の塊の使われ方の記録1行ぶんの中身。
// 持つのはそのレポートに出た名前の集合と数だけで、塊の中身・逃げ道の文字は入れない。

import { isPlainObject } from "remeda"

import {
  type ReportBlock,
  type ReportSection,
  sectionsWithFigure,
} from "../../../shared/report/report-block.ts"
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
}

const FIGURE_KINDS: readonly string[] = ["image", "mermaid", "graph", "svg"]

const IMAGE_FILE_EXTENSIONS: readonly string[] = [".png", ".jpg", ".jpeg", ".gif", ".webp"]

/**
 * 数える塊の欄。外す基準（直近4週間で0回）を塊の種類と同じく当てるため、既定の値でない欄が出たかを持つ。
 * 表のセルの `from` / `to`・`stats` の `before` / `total`・`list` の `label`・`list` の `flow`・`dimension` の `before`・`image` の `notes`。
 */
export const REPORT_BLOCK_FIELDS = [
  "tableChange",
  "statsBefore",
  "statsTotal",
  "listLabel",
  "listFlow",
  "dimensionBefore",
  "imageNotes",
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
    case "statsBefore":
      return block.kind === "stats" && block.items.some((item) => item.before.trim() !== "")
    case "statsTotal":
      return block.kind === "stats" && block.items.some((item) => item.total.trim() !== "")
    case "listLabel":
      return block.kind === "list" && block.items.some((item) => item.label.trim() !== "")
    case "listFlow":
      return block.kind === "list" && block.style === "flow"
    case "dimensionBefore":
      return block.kind === "dimension" && block.parts.some((part) => part.before.trim() !== "")
    case "imageNotes":
      return block.kind === "image" && block.notes.length > 0
  }
}
