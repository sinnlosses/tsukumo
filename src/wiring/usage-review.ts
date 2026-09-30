// 見直しの配線。前回の結果の読み書きと、提案を見送るコマンドの中身を選ぶ。

import type { SessionManagerOptions } from "../server/session/core/session-manager.ts"
import {
  readPreviousUsageReview,
  writePreviousUsageReview,
} from "../server/usage-review/adapter/previous-usage-review.ts"
import {
  readDismissedUsageProposalKeys,
  writeDismissedUsageProposalKey,
} from "../server/usage-review/adapter/usage-proposal-dismissal.ts"
import type { UsageReviewCommandPorts } from "../server/usage-review/core/usage-review-command.ts"
import type { UsageProposalDismissal } from "../shared/contract/usage-review.ts"
import type { SessionEvent } from "../shared/session/session-event.ts"
import { usageProposalKey, withoutDismissedProposals } from "../shared/usage-review/usage-review.ts"

export function wireUsageReview(): {
  readonly manager: Pick<
    SessionManagerOptions,
    "readPreviousUsageReview" | "writePreviousUsageReview"
  >
  readonly commands: UsageReviewCommandPorts
} {
  return {
    manager: {
      // 前回の見直しの結果は、読むときに見送った提案を除く（見送りは前回の結果のファイルを書き換えないため）。
      readPreviousUsageReview: () =>
        withoutDismissedProposals(readPreviousUsageReview(), readDismissedUsageProposalKeys()),
      writePreviousUsageReview,
    },
    commands: { dismissUsageProposal },
  }
}

/**
 * 提案を1件見送る。識別子（種類と対象の組）で書き、同じ識別子を返す（画面はこの識別子で札を消す）。
 * 書き込みは失敗しても例外を投げないので、返すイベントは常に1つ。
 */
function dismissUsageProposal(dismiss: UsageProposalDismissal): SessionEvent {
  const key = usageProposalKey(dismiss)
  writeDismissedUsageProposalKey(key)
  return { kind: "usage-proposal-dismissed", key }
}
