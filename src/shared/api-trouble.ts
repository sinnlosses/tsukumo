// API の不調（再試行と、API が返したエラーの種類）の語彙。サーバとブラウザの両方が読む契約
// なので shared に置く（docs/design.md 4.1・4.2）。
//
// 運ぶのは型の決まった理由だけ（エラーの列挙値・HTTP の状態コード・回数・待ち時間）。
// SDK の `result` の `errors` のような自由文は、会話の断片が混ざりうるので入れない
// （docs/coding-standards.md「会話内容の扱い」）。

/**
 * API が返したエラーの種類。SDK の `SDKAssistantMessageError`（0.3.280）と同じ綴りを持つ
 * （一致はテストで守る。`test/server/session-driver/adapter/sdk-driver.test.ts`）。知らない綴りは `unknown` に
 * 畳む（変換は `src/server/session-driver/core/sdk-message.ts`）。
 */
export const API_ERROR_KINDS = [
  "authentication_failed",
  "oauth_org_not_allowed",
  "account_on_hold",
  "verification_required",
  "billing_error",
  "rate_limit",
  "overloaded",
  "invalid_request",
  "model_not_found",
  "server_error",
  "unknown",
  "max_output_tokens",
  "cloud_credential_error",
] as const satisfies readonly string[]

export type ApiErrorKind = (typeof API_ERROR_KINDS)[number]

/**
 * API の呼び出しが失敗し、待ってから呼び直すという知らせ1回ぶん（SDK の `system` /
 * `api_retry`）。`attempt` は何回目の呼び直しか（1から）、`maxRetries` はその上限。
 *
 * `errorStatus` は HTTP の状態コードで、応答が無かった失敗（接続の切断・時間切れ）では
 * undefined（SDK が `null` を返す。受け取った境界で畳む）。
 */
export type ApiRetry = {
  readonly attempt: number
  readonly maxRetries: number
  readonly retryDelayMs: number
  readonly errorStatus: number | undefined
  readonly error: ApiErrorKind
}

/**
 * いまのターンで API が不調か（`SessionState.apiTrouble`）。ターンの中だけの状態で、
 * ターンの境目とモデルが何かを出したとき（本文・ツール・ステップの使用量など）に `none` へ戻る。
 *
 * - `none`: 不調の知らせは無い（あっても、そのあとモデルが応答した）
 * - `retrying`: 呼び直しを待っている。`at` は知らせが届いた時刻（`StampedEvent.at`）
 * - `errored`: API がエラーを返した（`assistant` の `error`）。まだ失敗とは限らない——
 *   出力の上限（`max_output_tokens`）のように、本体が立て直して続けることがある。失敗で
 *   終わるかは `turn-finished` が決め、そのときの理由の材料になる
 */
export type ApiTrouble =
  | { readonly kind: "none" }
  | ({ readonly kind: "retrying"; readonly at: number } & ApiRetry)
  | { readonly kind: "errored"; readonly error: ApiErrorKind }
