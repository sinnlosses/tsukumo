// 失敗の表示に出す理由の語と、押せる次の手を決める。

import type { RateLimit } from "../../../../../../../shared/session-driver/rate-limit.ts"
import type { TurnFailure } from "../../../../../../../shared/session-driver/turn-failure.ts"
import { turnFailureDetail, turnFailureLabel } from "../../../domain/api-error-label.ts"
import { rateLimitResetText } from "../../../domain/rate-limit-label.ts"

/**
 * 依頼を入力欄に戻す口。どちらも押すと入力欄に戻すだけで、送らない。
 *
 * - `none`: 戻す依頼の文が無い
 * - `request`: 同じ依頼を入力欄に戻す
 * - `after-reset`: 利用上限が戻る時刻を字に添えて、同じ依頼を入力欄に戻す
 */
type TurnFailureRetry =
  | { readonly kind: "none" }
  | {
      readonly kind: "request" | "after-reset"
      readonly label: string
      readonly request: string
    }

export type TurnFailureBlockModel = {
  /** 何が起きたかの語（内部の綴りは含めない）。 */
  readonly reason: string
  /** `title` に出す全文（内部の綴りを含む）。 */
  readonly detail: string
  readonly retry: TurnFailureRetry
}

export type TurnFailureBlockSource = {
  readonly failure: TurnFailure
  /** 戻す依頼の文。記録に依頼が無ければ空。 */
  readonly requestText: string
  readonly rateLimit: RateLimit
  /** いちばん新しいやり取りか。 */
  readonly newest: boolean
  readonly now: number
}

const RETRY_LABEL = "同じ依頼を入力欄に戻す"

export function turnFailureBlockOf(source: TurnFailureBlockSource): TurnFailureBlockModel {
  return {
    reason: turnFailureLabel(source.failure),
    detail: turnFailureDetail(source.failure),
    retry: retryOf(source),
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
