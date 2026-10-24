// 定着が終わったときの結果のうち、診断ログへ足跡を残すもの（失敗・飛ばした契機・縮みの免除・削った行）と、契機を止めたこと。

import {
  swallowedFailureFootprint,
  type SwallowedFailurePlace,
} from "../../../shared/diagnostic/swallowed-failure.ts"
import type {
  ChatConsolidationOutcome,
  ChatConsolidationResultKind,
} from "../../chat/core/chat-consolidation-writer.ts"
import type { ChatConsolidationRejection } from "../../chat/core/chat-consolidation.ts"
import type { DiagnosticBuffer } from "../../diagnostic/core/diagnostic.ts"

const CONSOLIDATION_FAILURE_PLACES = {
  aborted: "consolidation-aborted",
  threw: "consolidation-threw",
  "summary-write": "consolidation-summary-write",
} as const satisfies Record<string, string>

const CONSOLIDATION_REJECTION_PLACES = {
  "shape-structure": "consolidation-shape-structure",
  "shape-topics": "consolidation-shape-topics",
  "synopsis-empty": "consolidation-synopsis-empty",
  "synopsis-too-long": "consolidation-synopsis-too-long",
  "synopsis-reserved-tag": "consolidation-synopsis-reserved-tag",
  "synopsis-shrunk": "consolidation-synopsis-shrunk",
} as const satisfies Record<ChatConsolidationRejection | "synopsis-shrunk", string>

const CONSOLIDATION_RESULT_KIND_PLACES = {
  error_during_execution: "consolidation-result-error-during-execution",
  error_max_turns: "consolidation-result-error-max-turns",
  error_max_budget_usd: "consolidation-result-error-max-budget-usd",
  error_max_structured_output_retries: "consolidation-result-error-max-structured-output-retries",
  other: "consolidation-result-other",
} as const satisfies Record<ChatConsolidationResultKind, string>

/** 足跡ごとに `now()` を呼んで時刻を打つ。 */
export function noteConsolidationOutcome(
  outcome: ChatConsolidationOutcome,
  diagnostic: DiagnosticBuffer,
  now: () => number,
): void {
  if (outcome.kind === "failed") {
    diagnostic.add(
      swallowedFailureFootprint(
        now(),
        {
          feature: "chat",
          place: failurePlaceOf(outcome),
        },
        outcome.reason === "threw" ? outcome.error : undefined,
      ),
    )
  }
  if (outcome.kind === "backed-off") {
    diagnostic.add(
      swallowedFailureFootprint(
        now(),
        { feature: "chat", place: "consolidation-backed-off" },
        undefined,
      ),
    )
  }
  if (outcome.kind === "written" && outcome.shrinkWaived) {
    diagnostic.add(
      swallowedFailureFootprint(
        now(),
        { feature: "chat", place: "consolidation-synopsis-shrink-waived" },
        undefined,
      ),
    )
  }
  if (outcome.kind === "written" && outcome.droppedLines > 0) {
    diagnostic.add({
      flow: "synopsis-trim",
      at: now(),
      droppedLines: outcome.droppedLines,
    })
  }
}

/** 続けて失敗して契機を止めたときの足跡（止めた1回だけ）。 */
export function noteConsolidationHalt(diagnostic: DiagnosticBuffer, now: () => number): void {
  diagnostic.add(
    swallowedFailureFootprint(now(), { feature: "chat", place: "consolidation-halted" }, undefined),
  )
}

function failurePlaceOf(
  outcome: Extract<ChatConsolidationOutcome, { kind: "failed" }>,
): Extract<SwallowedFailurePlace, { feature: "chat" }>["place"] {
  switch (outcome.reason) {
    case "unreadable-result":
      return CONSOLIDATION_REJECTION_PLACES[outcome.rejection]
    case "query-result":
      return CONSOLIDATION_RESULT_KIND_PLACES[outcome.resultKind]
    default:
      return CONSOLIDATION_FAILURE_PLACES[outcome.reason]
  }
}
