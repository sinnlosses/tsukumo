// セッションの出来事（`SessionEvent`）のうち、ターンの終わり・API の不調・利用上限・トークンの使用量に関するものの型。

import type { ApiErrorKind, ApiRetry } from "../session-driver/api-trouble.ts"
import type { RateLimit } from "../session-driver/rate-limit.ts"
import type { TurnOutcome } from "../session-driver/turn-failure.ts"
import type { ModelTokenUsage, StepTokenUsage, TurnUsageScope } from "../token-usage/token-usage.ts"

export type TurnHealthEvent =
  /**
   * ターンが終わった（`result`。サブエージェントの中の `result` は変換で捨てる）。`outcome` は終わり方（{@link TurnOutcome}）。中断は失敗にしない。
   * 駆動が自分で起こすのは fake driver の中断（`interrupted`）と、復元の再生の区切り（入力の控えにある終わり方。無ければ `completed`）。
   */
  | { readonly kind: "turn-finished"; readonly outcome: TurnOutcome }
  /**
   * API の呼び出しが失敗し、待ってから呼び直す（SDK の `system` / `api_retry`）。呼び直すたびに1回ずつ届く。
   * 呼び直しが実った合図は来ないので、畳み込みはモデルが何かを出したところで「呼び直し中」を下ろす。
   * サブエージェントの呼び直しも見分けずに届く（SDK のメッセージに持ち場の印が無い）。
   */
  | { readonly kind: "api-retry"; readonly retry: ApiRetry }
  /**
   * API がエラーを返した（`assistant` の `error`。メインのものだけ）。
   * これだけではターンの失敗にしない（Claude Code が立て直して続けることがある。出力の上限など）。
   * 失敗で終わったかは続く `turn-finished` の `outcome` が決め、この種類がその理由になる。
   */
  | { readonly kind: "api-error"; readonly error: ApiErrorKind }
  /** 利用上限の状態が変わった（SDK の `rate_limit_event`。型定義は「変わったときに届く」と言う）。届くたびに丸ごと置き換える。 */
  | { readonly kind: "rate-limit-changed"; readonly rateLimit: RateLimit }
  /**
   * そのターンの終わりに SDK が渡してきたトークンの使用量（`result` の `modelUsage`）。
   * 運ぶのは `query()` の中の累計そのままで、ターンごとの増分に直すのは受け取った側。
   *
   * 画面には出ない。畳み込みは何もせず、行き先は `~/.tsukumo/token-usage/` の記録だけ。
   * `turn-finished` に相乗りさせずに別のイベントにしてあるのは、使用量を持たない終わり方があるから（復元の再生・fake driver・`modelUsage` の無い `result`）。
   * 数とモデルの名前だけで、会話の内容は入らない。
   */
  | { readonly kind: "token-usage"; readonly cumulative: readonly ModelTokenUsage[] }
  /**
   * assistant 1ステップぶんの使用量（`assistant` メッセージの `message.usage`）。
   * ターンの中を「メインループぶん」と「サブエージェントぶん」に割れるのはこの経路だけ
   * （`result` の `modelUsage` は両方を混ぜた累計なので、モデルが同じだと割れない）。
   *
   * `messageId` を運ぶのは、同じ `message.id` のステップが何度も届くから。
   * 返答が流れている間は完成したブロックごとに `assistant` が出て、`message.usage` はまだ確定値ではない
   * （`sdk.d.ts`: 「several consecutive assistant messages can share message.id ... message.usage is not final」）。
   * 同じ `message.id` の最後を取るのは受け取った側。
   *
   * 画面には出ない（畳み込みは何もしない）。行き先は `~/.tsukumo/token-usage/` の記録だけ。数だけで、本文も思考も入らない。
   */
  | {
      readonly kind: "step-usage"
      readonly messageId: string
      readonly scope: TurnUsageScope
      readonly usage: StepTokenUsage
    }
