// 見直しと提案の実行の使い捨ての `query()`。会話のセッションとは別の子プロセスで、走りきったら終わる。
// 依頼文・セリフ・結果の本文は会話の内容に当たるので、ここではログにもファイルにも書かない（足跡は数と種類の語だけ）。

import { query, type Options } from "@anthropic-ai/claude-agent-sdk"

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import {
  abortControllerFor,
  recordedMessages,
  type ThrowawayQueryWatch,
} from "../../adapter/sdk-throwaway-query.ts"
import type {
  UsageProposalQueryRequest,
  UsageReviewQueryRequest,
} from "../core/usage-review-runner.ts"
import type { UsageReviewIntake } from "../core/usage-review-tool.ts"
import { usageProposalQueryOptions, usageReviewQueryOptions } from "./sdk-usage-review-option.ts"

/** 足跡を残す先（種類は見直し・提案の実行の側で決める）。 */
type UsageReviewQueryWatch = Pick<ThrowawayQueryWatch, "record" | "now">

/**
 * 見直しを1回走らせる。走りきったら resolve し、起こせない・失敗・中断なら reject する。
 * 段と結果は `intake` が、セリフは `speak` の handler が `onEvent` へ流す。
 */
export async function queryUsageReview(
  request: UsageReviewQueryRequest,
  intake: UsageReviewIntake,
  onEvent: (event: SessionEvent) => void,
  signal: AbortSignal,
  watch: UsageReviewQueryWatch,
): Promise<void> {
  await drain(usageReviewQueryOptions(request, intake, onEvent), request.prompt, signal, {
    kind: "usage-review",
    ...watch,
  })
}

/**
 * 提案1件を実行する。走りきったら resolve し、起こせない・失敗・中断なら reject する。
 * `mountWorkflowPlugin` は取り込んだワークフローのプラグインを載せるか（会話と同じ判定。`task` のときだけ使う）。
 */
export async function queryUsageProposal(
  request: UsageProposalQueryRequest,
  onEvent: (event: SessionEvent) => void,
  signal: AbortSignal,
  mountWorkflowPlugin: boolean,
  watch: UsageReviewQueryWatch,
): Promise<void> {
  await drain(
    usageProposalQueryOptions(request, onEvent, mountWorkflowPlugin),
    request.prompt,
    signal,
    { kind: "usage-proposal", ...watch },
  )
}

/** `query()` を起こして `result` まで読み切る。成功で終わらなければ reject する。 */
async function drain(
  options: Options,
  prompt: string,
  signal: AbortSignal,
  watch: ThrowawayQueryWatch,
): Promise<void> {
  const abortController = abortControllerFor(signal)
  const messages = query({ prompt, options: { ...options, abortController } })
  for await (const message of recordedMessages(messages, watch, signal)) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        return
      }
      throw new Error(`見直しの問い合わせが通らなかった（${message.subtype}）`)
    }
  }
  throw new Error("見直しの問い合わせの result が届かなかった")
}
