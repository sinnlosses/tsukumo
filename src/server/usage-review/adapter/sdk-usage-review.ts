// 見直しと提案の実行の使い捨ての `query()`。会話のセッションとは別の子プロセスで、走りきったら終わる。
// 依頼文・セリフ・結果の本文は会話の内容に当たるので、ここではログにもファイルにも書かない。

import { query, type Options } from "@anthropic-ai/claude-agent-sdk"

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type {
  UsageProposalQueryRequest,
  UsageReviewQueryRequest,
} from "../core/usage-review-runner.ts"
import type { UsageReviewIntake } from "../core/usage-review-tool.ts"
import { usageProposalQueryOptions, usageReviewQueryOptions } from "./sdk-usage-review-option.ts"

/**
 * 見直しを1回走らせる。走りきったら resolve し、起こせない・失敗・中断なら reject する。
 * 段と結果は `intake` が、セリフは `speak` の handler が `onEvent` へ流す。
 */
export async function queryUsageReview(
  request: UsageReviewQueryRequest,
  intake: UsageReviewIntake,
  onEvent: (event: SessionEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  await drain(usageReviewQueryOptions(request, intake, onEvent), request.prompt, signal)
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
): Promise<void> {
  await drain(
    usageProposalQueryOptions(request, onEvent, mountWorkflowPlugin),
    request.prompt,
    signal,
  )
}

/** `query()` を起こして `result` まで読み切る。成功で終わらなければ reject する。 */
async function drain(options: Options, prompt: string, signal: AbortSignal): Promise<void> {
  const abortController = new AbortController()
  if (signal.aborted) {
    abortController.abort()
  } else {
    signal.addEventListener(
      "abort",
      () => {
        abortController.abort()
      },
      { once: true },
    )
  }
  for await (const message of query({ prompt, options: { ...options, abortController } })) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        return
      }
      throw new Error(`見直しの問い合わせが通らなかった（${message.subtype}）`)
    }
  }
  throw new Error("見直しの問い合わせの result が届かなかった")
}
