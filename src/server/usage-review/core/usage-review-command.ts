// `usage-review` が受けるコマンドの表。

import type {
  UsageProposalKeyInput,
  usageReviewContract,
} from "../../../shared/contract/usage-review.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../shared/session/session-default.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import { type UsageProposal, usageProposalKey } from "../../../shared/usage-review/usage-review.ts"
import type { CommandEventSink, FeatureCommandTable } from "../../core/command-receiver.ts"
import type { UsageReviewRunner } from "./usage-review-runner.ts"

export type UsageReviewCommandPorts = {
  /**
   * トークン消費の画面の札から提案を1件見送り、流し直す `usage-proposal-dismissed` を返す。
   * 書き込みは失敗しても投げない口なので、返すイベントは常に1つ。
   */
  readonly dismissUsageProposal: (dismissal: UsageProposalKeyInput) => SessionEvent
  readonly runner: Pick<UsageReviewRunner, "startReview" | "runProposal" | "interrupt">
}

/**
 * 手続きの context の `session` のうち、この表が読むもの。
 * 走りが流すイベントは `generation()` を流すたびに引くので、起こし直しをまたいでもいまの代へ流れる。
 */
export type UsageReviewSession = CommandEventSink & {
  readonly state: () => Pick<SessionState, "model" | "usageReview" | "previousUsageReview">
}

/** `usage-review` が受けるコマンドの表。走りが流すイベントの行き先が `session` なので、コマンドを受けるたびに作る。 */
export function usageReviewCommands(
  ports: UsageReviewCommandPorts,
  session: UsageReviewSession,
): FeatureCommandTable<typeof usageReviewContract> {
  const emit = (event: SessionEvent): void => {
    session.generation().emit(event)
  }
  const model = (): string => session.state().model ?? BUILTIN_SESSION_DEFAULT.model
  return {
    start: {
      kind: "call",
      receive: async () => ports.runner.startReview(model(), emit),
      failure: FRAME_ERROR_REASON.usageReviewRunning,
    },
    // 提案が見つからないときの断りは手続きが先に返す（この行の断りは走っているときだけ）。
    runProposal: {
      kind: "call",
      receive: async (input) => {
        const proposal = findUsageProposal(session.state(), input)
        return proposal !== undefined && ports.runner.runProposal(proposal, model(), emit)
      },
      failure: FRAME_ERROR_REASON.usageReviewRunning,
    },
    interrupt: {
      kind: "call",
      receive: async () => {
        ports.runner.interrupt()
        return true
      },
      failure: FRAME_ERROR_REASON.usageReviewInterruptFailed,
    },
    // 起こし直さない（書いて、`usage-proposal-dismissed` を流すだけ）。
    dismissProposal: {
      kind: "write",
      receive: ports.dismissUsageProposal,
      failure: FRAME_ERROR_REASON.usageProposalDismissFailed,
    },
  }
}

/** いまの結果、無ければ前回の結果から、識別子が同じ提案を引く。 */
export function findUsageProposal(
  state: Pick<SessionState, "usageReview" | "previousUsageReview">,
  input: UsageProposalKeyInput,
): UsageProposal | undefined {
  const key = usageProposalKey(input)
  const proposals = [
    ...(state.usageReview.kind === "result" ? state.usageReview.findings.proposals : []),
    ...(state.previousUsageReview.kind === "found"
      ? state.previousUsageReview.findings.proposals
      : []),
  ]
  return proposals.find((proposal) => usageProposalKey(proposal) === key)
}
