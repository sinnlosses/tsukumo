// API のエラーの種類と、ターンの失敗の理由を、画面に出す日本語にする（docs/glossary.md
// 「ターンの失敗」）。読むのは入力欄の経過時間の行（`components/page/conversation/dispatch/`）と、メインビューの
// やり取りの末尾（`components/page/conversation/main-view/`）の2つ。
//
// **綴り（`rate_limit` など）も一緒に出す**のは描く側の仕事で、ここは語だけを持つ。語は
// 「何が起きたか」を言い、直し方までは言わない（直し方は種類ごとに違い、tsukumo からは確かめられない）。

import { type ApiErrorKind } from "../../shared/api-trouble.ts"
import { type TurnFailure } from "../../shared/turn-failure.ts"

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

/**
 * ターンの失敗の理由の語。API のエラーなら種類の語に綴りを添える（`API が混んでいる（overloaded）`。
 * 語だけでは同じ種類を調べるときの手がかりにならないため）。
 */
export function turnFailureLabel(failure: TurnFailure): string {
  switch (failure.kind) {
    case "api-error":
      return `${apiErrorLabel(failure.error)}（${failure.error}）`
    case "max-turns":
      return "往復の上限に当たった"
    case "max-budget":
      return "予算の上限に当たった"
    case "execution-error":
      return "実行中のエラーで止まった"
  }
}
