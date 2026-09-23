// ターンがどう終わったか・失敗ならなぜか（docs/glossary.md「ターンの失敗」）の語彙。
// **サーバとブラウザの両方が読む契約**なので shared に置く（docs/design.md 4.1・4.2）。
//
// **理由は型の決まった値だけ**で、SDK の `result` の `errors`（自由文）は運ばない
// （会話の断片が混ざりうる。docs/coding-standards.md「会話内容の扱い」）。

import { type ApiErrorKind } from "./api-trouble.ts"

/**
 * `result` だけから分かる失敗の理由（`turn-finished` の `outcome` が `failed` のとき）。
 * **API のエラーの種類は `result` に載らない**（`assistant` の `error` と `api_retry` にだけ
 * 載る）ので、`api-error` はここでは種類を持たない。種類を足して {@link TurnFailure} にするのは
 * 畳み込み（`src/shared/session-state.ts`）。
 *
 * - `api-error`: API のエラーで止まった（`result` の `success` で `is_error` が true）
 * - `max-turns`: 往復の上限に当たった（`error_max_turns`）
 * - `max-budget`: 予算の上限に当たった（`error_max_budget_usd`）
 * - `execution-error`: 実行中のエラー（中断でない `error_during_execution` と、知らない種別）
 */
export type TurnFailureCause =
  | { readonly kind: "api-error" }
  | { readonly kind: "max-turns" }
  | { readonly kind: "max-budget" }
  | { readonly kind: "execution-error" }

/**
 * ターンの終わり方（`turn-finished` の `outcome`）。
 *
 * - `completed`: 終わった（`result` の `success`）
 * - `interrupted`: 途中で止まったが、失敗ではない（中断。**止まった理由が分からない
 *   `error_during_execution` もここ**——中断がいちばん多く、失敗と言い切れないため）
 * - `failed`: 失敗で終わった。理由は {@link TurnFailureCause}
 */
export type TurnOutcome =
  | { readonly kind: "completed" }
  | { readonly kind: "interrupted" }
  | { readonly kind: "failed"; readonly cause: TurnFailureCause }

/**
 * 失敗で終わったターンの理由（記録と `TurnProgress` に残る形）。{@link TurnFailureCause} の
 * `api-error` に、そのターンで届いた API のエラーの種類を足したもの（届いていなければ
 * `unknown`）。
 */
export type TurnFailure =
  | { readonly kind: "api-error"; readonly error: ApiErrorKind }
  | { readonly kind: "max-turns" }
  | { readonly kind: "max-budget" }
  | { readonly kind: "execution-error" }

/**
 * 終わったターンが失敗だったか（`TurnProgress` の `finished` の `ending`）。`ended` は失敗でない
 * 終わり方すべて（完了・中断）。
 */
export type TurnEnding =
  | { readonly kind: "ended" }
  | { readonly kind: "failed"; readonly failure: TurnFailure }
