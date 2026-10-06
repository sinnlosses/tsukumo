// テストが使う、手で書いた架空の `report` イベント（`SessionEvent`）と `ReportDraft` の組み立て。
// 既定は欄の「無い」の値で、呼ぶ側は確かめたい欄だけを渡す。

import type { ReportDraft } from "../../src/server/report/core/report-violation.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"

/** `report` ツールの呼び出し1件。 */
export function reportEvent(
  overrides: Partial<Omit<Extract<SessionEvent, { readonly kind: "report" }>, "kind">> = {},
): Extract<SessionEvent, { readonly kind: "report" }> {
  return {
    kind: "report",
    toolUseId: "fictional-report",
    conclusion: "架空の結論",
    sections: [],
    favor: "",
    checks: [],
    task: { kind: "none" },
    workPlanClosing: "none",
    closing: { kind: "none" },
    waitingLine: { kind: "none" },
    unknownBlockCount: 0,
    sessionSummary: undefined,
    ...overrides,
  }
}

/** 記法の検査にかけるレポート1件。 */
export function reportDraft(overrides: Partial<ReportDraft> = {}): ReportDraft {
  return {
    conclusion: "架空の結論",
    sections: [],
    favor: "",
    checks: [],
    fileContents: new Map(),
    task: { kind: "none" },
    workPlanClosing: "none",
    ...overrides,
  }
}
