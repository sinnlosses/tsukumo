// テストが使う、手で書いた架空の `report` イベント（`SessionEvent`）と `ReportDraft` の組み立て。
// 既定は欄の「無い」の値で、呼ぶ側は確かめたい欄だけを渡す。
// `conclusionSentenceChars` は、渡さなければ `conclusion` を1要素として数える。

import type { ReportDraft } from "../../src/server/report/core/report-violation.ts"
import { parseConclusion } from "../../src/shared/report/conclusion-sentence.ts"
import type { ReportSection } from "../../src/shared/report/report-block.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"

/** `report` ツールの呼び出し1件。 */
export function reportEvent(
  overrides: Partial<Omit<Extract<SessionEvent, { readonly kind: "report" }>, "kind">> = {},
): Extract<SessionEvent, { readonly kind: "report" }> {
  const conclusion = overrides.conclusion ?? "架空の結論"
  return {
    kind: "report",
    toolUseId: "fictional-report",
    argumentChars: { total: 0, fields: {} },
    inheritedFields: [],
    conclusion,
    conclusionSentenceChars: parseConclusion(conclusion)?.conclusionSentenceChars ?? [],
    conclusionFirstSentence: parseConclusion(conclusion)?.conclusionFirstSentence ?? "",
    keyFigures: [],
    figure: { kind: "none", reason: "unrecorded" },
    sections: [],
    favor: "",
    retrospective: { kind: "none" },
    checks: [],
    task: { kind: "none" },
    workPlanClosing: "none",
    closing: { kind: "none" },
    waitingLine: { kind: "none" },
    unknownBlockCount: 0,
    title: undefined,
    sessionSummary: undefined,
    sessionRemaining: { kind: "unrecorded" },
    imageSizes: [],
    unshelvedImages: [],
    ...overrides,
  }
}

/** 節だけを渡す `report` ツールの呼び出し1件。 */
export function reportOfSections(
  sections: readonly ReportSection[],
  unknownBlockCount = 0,
): Extract<SessionEvent, { readonly kind: "report" }> {
  return reportEvent({ sections, unknownBlockCount })
}

/** 記法の検査にかけるレポート1件。 */
export function reportDraft(overrides: Partial<ReportDraft> = {}): ReportDraft {
  const conclusion = overrides.conclusion ?? "架空の結論"
  return {
    conclusion,
    conclusionSentenceChars: parseConclusion(conclusion)?.conclusionSentenceChars ?? [],
    keyFigures: [],
    figure: { kind: "none", reason: "unrecorded" },
    sections: [],
    retrospective: { kind: "none" },
    favor: "",
    checks: [],
    fileContents: new Map(),
    task: { kind: "none" },
    workPlanClosing: "none",
    ...overrides,
  }
}
