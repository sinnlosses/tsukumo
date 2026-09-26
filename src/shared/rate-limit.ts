// 利用上限（docs/glossary.md「利用上限」）の語彙。サーバとブラウザの両方が読む契約なので
// shared に置く（docs/design.md 4.1・4.2）。

/**
 * どの枠の上限か。SDK の `rateLimitType` を畳んだもの（`seven_day_overage_included` は
 * `seven-day` に寄せる）。無い・知らない綴りは `other`（枠の名前を出さずに「利用上限」とだけ言う）。
 */
export type RateLimitBucket =
  | "five-hour"
  | "seven-day"
  | "seven-day-opus"
  | "seven-day-sonnet"
  | "overage"
  | "other"

/**
 * いまの利用上限の状態（`SessionState.rateLimit`。SDK の `rate_limit_event` の
 * `rate_limit_info`）。claude.ai の契約で使っているときだけ届く（API キーでは届かない）。
 *
 * - `clear`: 上限に余裕がある（`allowed`）か、まだ知らせが届いていない
 * - `warning`: 上限が近い（`allowed_warning`）
 * - `rejected`: 上限に達して、戻るまで使えない
 *
 * `resetsAt` は戻る時刻（エポックミリ秒。SDK は秒で送ってくるので境界で直す）。知らせに
 * 無ければ undefined（画面は時刻を添えずに出す）。使用率（`utilization`）は運ばない——
 * 単位（0〜1 か 0〜100 か）が型定義に書かれておらず、読み違えた数を出すより出さないほうを採る。
 */
export type RateLimit =
  | { readonly kind: "clear" }
  | {
      readonly kind: "warning" | "rejected"
      readonly bucket: RateLimitBucket
      readonly resetsAt: number | undefined
    }
