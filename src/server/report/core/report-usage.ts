// `report` の塊の使われ方の記録1行ぶんの中身。
// 持つのはそのレポートに出た名前の集合と数だけで、塊の中身・逃げ道の文字は入れない。

import type { ReportSection } from "../../../shared/report-block.ts"
import type { SessionEvent } from "../../../shared/session-event.ts"
import { type MarkdownNotation, notationsInSections } from "./report-violation.ts"

export type ReportUsageEntry = {
  readonly at: number
  readonly sessionId: string
  /** その回に出た塊の種類（重複無し）。 */
  readonly blockKinds: readonly string[]
  /** その回に逃げ道（`markdown` の塊）の中に出た記法の種類（重複無し）。 */
  readonly notations: readonly MarkdownNotation[]
  readonly unknownBlockCount: number
}

/** 書けなくても例外を投げない。 */
export type ReportUsageLog = {
  readonly append: (entry: ReportUsageEntry) => void
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
    notations: notationsInSections(event.sections),
    unknownBlockCount: event.unknownBlockCount,
  }
}

function blockKindsOf(sections: readonly ReportSection[]): readonly string[] {
  return [...new Set(sections.flatMap((section) => section.blocks.map((block) => block.kind)))]
}
