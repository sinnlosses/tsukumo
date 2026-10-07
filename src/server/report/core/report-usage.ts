// `report` の塊の使われ方の記録1行ぶんの中身。
// 持つのはそのレポートに出た名前の集合と数だけで、塊の中身・逃げ道の文字は入れない。

import type { ReportBlock, ReportSection } from "../../../shared/report/report-block.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  containedNotationsInSections,
  escapeNotationsInSections,
  type EscapeNotation,
  type MarkdownNotation,
  notationsInSections,
} from "./report-violation.ts"

export type ReportUsageEntry = {
  readonly at: number
  readonly sessionId: string
  /** その回に出た塊の種類（重複無し）。 */
  readonly blockKinds: readonly string[]
  /** その回に出た塊の欄（重複無し）。 */
  readonly blockFields: readonly ReportBlockField[]
  /** その回に逃げ道（`markdown` の塊）の外側に出た記法の種類（重複無し）。 */
  readonly notations: readonly MarkdownNotation[]
  /** その回に逃げ道の HTML の容れ物の中に出た記法の種類（重複無し）。 */
  readonly containedNotations: readonly MarkdownNotation[]
  /** その回に逃げ道に出た、塊の無い記法の種類（重複無し）。 */
  readonly escapeNotations: readonly EscapeNotation[]
  readonly unknownBlockCount: number
}

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

/** 描いた（差し戻されなかった）`report` から、記録1行ぶんの中身を作る。 */
export function reportUsageEntryOf(
  event: Extract<SessionEvent, { readonly kind: "report" }>,
  sessionId: string,
  at: number,
): ReportUsageEntry {
  return {
    at,
    sessionId,
    blockKinds: blockKindsOf(event.sections),
    blockFields: blockFieldsOf(event.sections),
    notations: notationsInSections(event.sections),
    containedNotations: containedNotationsInSections(event.sections),
    escapeNotations: escapeNotationsInSections(event.sections),
    unknownBlockCount: event.unknownBlockCount,
  }
}

function blockKindsOf(sections: readonly ReportSection[]): readonly string[] {
  return [...new Set(sections.flatMap((section) => section.blocks.map((block) => block.kind)))]
}

function blockFieldsOf(sections: readonly ReportSection[]): readonly ReportBlockField[] {
  const blocks = sections.flatMap((section) => section.blocks)
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
