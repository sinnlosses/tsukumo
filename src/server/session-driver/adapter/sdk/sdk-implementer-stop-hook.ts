// 台本の実装役の agent が、実装の範囲の最後の段まで申告せずに終わろうとするのを止める `SubagentStop` フックの登録。

import type { HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"

import { judgeImplementerStop } from "../../../work-plan/core/work-plan-gate.ts"
import type { CallReview } from "../../core/call-review.ts"

/**
 * `SubagentStop` フックを1つ登録する。
 * 台本の写しで見えた agent（`agent_id` が写しにある）だけを {@link judgeImplementerStop} にかけ、止めるときは `decision: "block"` で理由を返す。
 */
export function implementerStopHooks(
  review: Pick<CallReview, "latestPlan" | "workflowAgentPhase">,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    SubagentStop: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "SubagentStop") {
              return {}
            }
            const verdict = judgeImplementerStop(
              review.workflowAgentPhase(input.agent_id),
              review.latestPlan(),
              input.stop_hook_active,
            )
            return verdict.kind === "block" ? { decision: "block", reason: verdict.reason } : {}
          },
        ],
      },
    ],
  }
}
