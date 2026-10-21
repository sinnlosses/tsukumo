// 定着が終わったときの結果のうち、診断ログへ足跡を残すもの（失敗・縮みの免除・削った行）。

import { swallowedFailureFootprint } from "../../../shared/diagnostic/swallowed-failure.ts"
import type { ChatConsolidationOutcome } from "../../chat/core/chat-consolidation-writer.ts"
import type { ChatConsolidationRejection } from "../../chat/core/chat-consolidation.ts"
import type { DiagnosticBuffer } from "../../diagnostic/core/diagnostic.ts"

const CONSOLIDATION_FAILURE_PLACES = {
  aborted: "consolidation-aborted",
  threw: "consolidation-threw",
  "summary-write": "consolidation-summary-write",
  "episode-write": "consolidation-episode-write",
} as const satisfies Record<string, string>

const CONSOLIDATION_REJECTION_PLACES = {
  shape: "consolidation-unreadable-result",
  "synopsis-empty": "consolidation-synopsis-empty",
  "synopsis-too-long": "consolidation-synopsis-too-long",
  "synopsis-reserved-tag": "consolidation-synopsis-reserved-tag",
  "synopsis-shrunk": "consolidation-synopsis-shrunk",
} as const satisfies Record<ChatConsolidationRejection | "synopsis-shrunk", string>

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
          place:
            outcome.reason === "unreadable-result"
              ? CONSOLIDATION_REJECTION_PLACES[outcome.rejection]
              : CONSOLIDATION_FAILURE_PLACES[outcome.reason],
        },
        outcome.reason === "threw" ? outcome.error : undefined,
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
