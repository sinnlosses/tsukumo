// 利用上限の語彙。

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
 * - `clear`: 上限に余裕がある（`allowed`）・まだ知らせが届いていない・近い（`allowed_warning`）
 * - `rejected`: 上限に達して、戻るまで使えない
 *
 * 「近い」（`allowed_warning`）は `clear` に畳む（枠の残り具合はサイドバーの利用枠が出す）。
 *
 * `resetsAt` は戻る時刻（エポックミリ秒。SDK は秒で送ってくるので境界で直す）。知らせに無ければ undefined（画面は時刻を添えずに出す）。
 * 使用率（`utilization`）は運ばない（単位が 0〜1 か 0〜100 かが型定義に書かれておらず、読み違えた数を出すより出さないほうを採る）。
 */
export type RateLimit =
  | { readonly kind: "clear" }
  | {
      readonly kind: "rejected"
      readonly bucket: RateLimitBucket
      readonly resetsAt: number | undefined
    }
