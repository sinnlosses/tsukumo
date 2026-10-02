// 利用上限に達したことと、戻る時刻を、画面に出す日本語にする。

import type { RateLimit, RateLimitBucket } from "../../../../../shared/session-driver/rate-limit.ts"
import { dayAwareClockTime } from "../../../../utils/clock.ts"

/** 戻る時刻の字。同じ日なら「18:00」、別の日なら「9/26 18:00」。知らせに時刻が無ければ `unknown`。 */
export type RateLimitResetText =
  | { readonly kind: "known"; readonly text: string }
  | { readonly kind: "unknown" }

/** 利用上限の枠の語。`other` は枠の名前を出さない（空）。 */
const RATE_LIMIT_BUCKET_LABEL = {
  "five-hour": "5時間枠",
  "seven-day": "7日間枠",
  "seven-day-opus": "7日間枠（Opus）",
  "seven-day-sonnet": "7日間枠（Sonnet）",
  overage: "超過利用枠",
  other: "",
} satisfies Record<RateLimitBucket, string>

/** 「5時間枠の利用上限」の形の語。枠が分からなければ「利用上限」。 */
export function rateLimitSubject(bucket: RateLimitBucket): string {
  const bucketLabel = RATE_LIMIT_BUCKET_LABEL[bucket]
  return bucketLabel === "" ? "利用上限" : `${bucketLabel}の利用上限`
}

export function rateLimitResetText(
  rateLimit: Extract<RateLimit, { readonly kind: "rejected" }>,
  now: number,
): RateLimitResetText {
  return rateLimit.resetsAt === undefined
    ? { kind: "unknown" }
    : { kind: "known", text: dayAwareClockTime(rateLimit.resetsAt, now) }
}
