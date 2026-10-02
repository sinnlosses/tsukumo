// API のエラーの種類と、ターンの失敗の理由を、画面に出す日本語にする。
//
// 語は「何が起きたか」を言い、直し方までは言わない（直し方は種類ごとに違い、tsukumo からは確かめられない）。

import type { ApiErrorKind, ApiTrouble } from "../../../../../shared/session-driver/api-trouble.ts"
import type { TurnFailure } from "../../../../../shared/session-driver/turn-failure.ts"

const API_ERROR_LABEL = {
  authentication_failed: "認証が切れた",
  oauth_org_not_allowed: "この組織では使えない",
  account_on_hold: "アカウントが保留されている",
  verification_required: "本人確認が要る",
  billing_error: "支払いの問題",
  rate_limit: "利用上限に当たった",
  overloaded: "API が混んでいる",
  invalid_request: "API が依頼を受け付けなかった",
  model_not_found: "モデルが見つからない",
  server_error: "API のサーバの不調",
  unknown: "API のエラー",
  max_output_tokens: "出力の上限に当たった",
  cloud_credential_error: "クラウドの認証情報の問題",
} satisfies Record<ApiErrorKind, string>

/** API のエラーの種類の語（「API が混んでいる」など）。 */
export function apiErrorLabel(error: ApiErrorKind): string {
  return API_ERROR_LABEL[error]
}

/** 呼び直しを待っているあいだの知らせ。`label` は行に出す短い字、`detail` は `title` で読ませる全文。 */
export type ApiRetryNotice = { readonly label: string; readonly detail: string }

/** 呼び直しの知らせ（「再試行中 2/10」と、理由と待ち時間）。 */
export function apiRetryNotice(
  retry: Extract<ApiTrouble, { readonly kind: "retrying" }>,
): ApiRetryNotice {
  const status = retry.errorStatus === undefined ? "応答なし" : String(retry.errorStatus)
  const seconds = Math.max(1, Math.round(retry.retryDelayMs / 1000))
  return {
    label: `再試行中 ${String(retry.attempt)}/${String(retry.maxRetries)}`,
    detail: `${apiErrorLabel(retry.error)}（${status}）。${String(seconds)}秒おいて呼び直す`,
  }
}

/** 失敗で終わったターンの、API のエラーの種類ごとの「何が起きたか」の文。 */
const TURN_FAILURE_REASON = {
  authentication_failed: "認証が切れていて API を呼べなかった",
  oauth_org_not_allowed: "この組織では API を呼べなかった",
  account_on_hold: "アカウントが保留されていて API を呼べなかった",
  verification_required: "本人確認が要るので API を呼べなかった",
  billing_error: "支払いの問題で API を呼べなかった",
  rate_limit: "利用上限に達した",
  overloaded: "API が混んでいて受け付けなかった",
  invalid_request: "API が依頼を受け付けなかった",
  model_not_found: "モデルが見つからなかった",
  server_error: "API のサーバが応えなかった",
  unknown: "API がエラーを返した",
  max_output_tokens: "出力の上限に当たった",
  cloud_credential_error: "クラウドの認証情報の問題で API を呼べなかった",
} satisfies Record<ApiErrorKind, string>

/** ターンの失敗の理由の語。内部の綴りは含めない（綴りは `turnFailureCode`）。 */
export function turnFailureLabel(failure: TurnFailure): string {
  switch (failure.kind) {
    case "api-error":
      return TURN_FAILURE_REASON[failure.error]
    case "max-turns":
      return "往復の上限に当たった"
    case "max-budget":
      return "予算の上限に当たった"
    case "execution-error":
      return "実行中のエラーで止まった"
  }
}

/** ターンの失敗の内部の綴り（`server_error`・`max-turns` など）。`title` にだけ出す。 */
export function turnFailureCode(failure: TurnFailure): string {
  return failure.kind === "api-error" ? failure.error : failure.kind
}

/** 失敗で終わったことの全文（`title` に出す。「失敗で終わった: <語>（<綴り>）」）。 */
export function turnFailureDetail(failure: TurnFailure): string {
  return `失敗で終わった: ${turnFailureLabel(failure)}（${turnFailureCode(failure)}）`
}
