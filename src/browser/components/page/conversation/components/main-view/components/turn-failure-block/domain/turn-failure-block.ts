// 失敗の塊に出す理由の語と、押せる次の手を決める。

import type { RateLimit } from "../../../../../../../../../shared/session-driver/rate-limit.ts"
import type { TurnFailure } from "../../../../../../../../../shared/session-driver/turn-failure.ts"
import { turnFailureDetail, turnFailureLabel } from "../../../../../domain/api-error-label.ts"
import { rateLimitResetText } from "../../../../../domain/rate-limit-label.ts"

/**
 * 依頼を入力欄に戻す口。どちらも押すと入力欄に戻すだけで、送らない。
 *
 * - `none`: 戻す依頼の文が無い
 * - `request`: 同じ依頼を入力欄に戻す
 * - `after-reset`: 利用上限が戻る時刻を字に添えて、同じ依頼を入力欄に戻す
 */
export type TurnFailureRetry =
  | { readonly kind: "none" }
  | {
      readonly kind: "request" | "after-reset"
      readonly label: string
      readonly request: string
    }

/** 進み具合の帯の手順の一覧で、失敗した手順を開く口。 */
export type TurnFailureStepsDoor =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly label: string }

export type TurnFailureBlockModel = {
  /** 何が起きたかの語（内部の綴りは含めない）。 */
  readonly reason: string
  /** `title` に出す全文（内部の綴りを含む）。 */
  readonly detail: string
  readonly retry: TurnFailureRetry
  readonly failedSteps: TurnFailureStepsDoor
}

export type TurnFailureBlockSource = {
  readonly failure: TurnFailure
  /** 戻す依頼の文。記録に依頼が無ければ空。 */
  readonly requestText: string
  readonly rateLimit: RateLimit
  /** いちばん新しいやり取りか。 */
  readonly newest: boolean
  /** いちばん新しい依頼の手順が帯に出ていて、失敗した手順があるか。 */
  readonly hasFailedStep: boolean
  readonly now: number
}

const RETRY_LABEL = "同じ依頼を入力欄に戻す"
const FAILED_STEPS_LABEL = "失敗した手順を見る"

export function turnFailureBlockOf(source: TurnFailureBlockSource): TurnFailureBlockModel {
  return {
    reason: turnFailureLabel(source.failure),
    detail: turnFailureDetail(source.failure),
    retry: retryOf(source),
    failedSteps:
      source.newest && source.hasFailedStep
        ? { kind: "shown", label: FAILED_STEPS_LABEL }
        : { kind: "none" },
  }
}

function retryOf(source: TurnFailureBlockSource): TurnFailureRetry {
  const { requestText, rateLimit } = source
  if (requestText === "") {
    return { kind: "none" }
  }
  if (source.newest && rateLimit.kind === "rejected") {
    const resetText = rateLimitResetText(rateLimit, source.now)
    if (resetText.kind === "known") {
      return {
        kind: "after-reset",
        label: `${resetText.text}に戻る · 依頼を入力欄に戻す`,
        request: requestText,
      }
    }
  }
  return { kind: "request", label: RETRY_LABEL, request: requestText }
}
