// `usage-review` が受けるコマンドの表（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。

import { type DismissUsageProposalCommand } from "../../../shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import { type FeatureCommandTable, NO_COMMAND_GUARD } from "../../core/command-receiver.ts"

export type UsageReviewCommandPorts = {
  /**
   * トークン消費の画面の札から提案を1件見送り、**流し直す `usage-proposal-dismissed` を返す**
   * （書き込み先は `src/server/usage-review/adapter/usage-proposal-dismissal.ts`）。書き込みは
   * 失敗しても投げない口なので、返すイベントは常に1つ。
   */
  readonly dismissUsageProposal: (dismiss: DismissUsageProposalCommand) => SessionEvent
}

/** `usage-review` が受けるコマンドの表。 */
export function usageReviewCommands(
  ports: UsageReviewCommandPorts,
): FeatureCommandTable<"dismiss-usage-proposal"> {
  return {
    // **起こし直さない**（書いて、`usage-proposal-dismissed` を流すだけ）。
    "dismiss-usage-proposal": {
      ...NO_COMMAND_GUARD,
      kind: "write",
      receive: ports.dismissUsageProposal,
      failure: FRAME_ERROR_REASON.usageProposalDismissFailed,
    },
  }
}
