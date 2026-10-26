// `report` の差し戻しの条の名前と、条ごとの段（差し戻すか、数えるだけか）。

import type { ProcedureRejection } from "./procedure-rejection.ts"
import type { ReportViolation } from "./report-violation.ts"

export type ReportRejectionReason = ProcedureRejection | ReportViolation["kind"]

/** 条の段。`count` は当てはまっても差し戻さず、通した呼び出しの記録に名前を残すだけ。`reject` は差し戻す。 */
export type ReportRejectionMode = "count" | "reject"

export type ReportRejectionModes = Readonly<Record<ReportRejectionReason, ReportRejectionMode>>

/**
 * 理由ごとの段。新しい理由は `count` で入れ、`reject` へ上げるときは記録の数と日付を `docs/history/decision.md` に1行書く。
 * 各理由に根拠の行があることは文書の検査が見る。
 */
export const REPORT_REJECTION_MODES = {
  resend: "reject",
  "nothing-new": "reject",
  "unanswered-work-plan": "reject",
  "missing-work-plan-closing": "reject",
  "unfinished-phases": "reject",
  "finished-but-stopped": "reject",
  "finished-with-ng": "reject",
  "background-running": "reject",
  "long-conclusion": "reject",
  "unknown-mermaid": "reject",
  "too-many-notes": "reject",
  "crowded-notes": "count",
  "nested-fold": "reject",
  "unordered-options": "reject",
  "ragged-table": "reject",
  "long-table": "count",
  "many-emphasis-rows": "count",
  "sentence-table": "count",
  "long-list": "count",
  "bad-cards": "reject",
  "long-code": "reject",
  "ragged-chart": "reject",
  "unknown-emphasis": "reject",
  "short-series": "reject",
  "untitled-section": "count",
  "markdown-notation": "reject",
  "broken-svg": "reject",
  "unlegended-svg-tone": "reject",
  "unlegended-graph-tone": "reject",
  "broken-graph": "reject",
  "broken-timeline": "reject",
  "code-mismatch": "reject",
  "code-marks-range": "reject",
  "region-range": "reject",
  "long-first-sentence": "count",
  "bad-heading": "reject",
  "unobserved-without-how": "reject",
  "arrow-in-prose": "reject",
  "label-in-item": "reject",
  "labeled-ordered": "reject",
  "non-japanese": "reject",
  "plain-word": "reject",
  "browser-change-without-image": "reject",
  "figure-contradiction": "count",
} as const satisfies Record<ReportRejectionReason, ReportRejectionMode>
