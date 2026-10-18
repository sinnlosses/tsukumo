// API の不調（エラー・再試行・利用枠の超過）の知らせを、tsukumo 内部のイベントに変換する。
// 知らせは外部由来の値なので、unknown で受けて検証する。

import { isPlainObject } from "remeda"

import { API_ERROR_KINDS, type ApiErrorKind } from "../../../shared/session-driver/api-trouble.ts"
import type { RateLimit, RateLimitBucket } from "../../../shared/session-driver/rate-limit.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"

/**
 * `assistant` の `error` を `api-error` にする。
 * メインのものだけ（サブエージェントの中のエラーは Claude Code のターンの終わり方に効かない）。
 * 知らない綴りは `unknown` に畳む。
 */
export function apiErrorEvents(
  error: unknown,
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  return parentToolUseId === undefined && typeof error === "string"
    ? [{ kind: "api-error", error: toApiErrorKind(error) }]
    : []
}

/**
 * `system` / `api_retry` を `api-retry` にする。
 * 回数・上限・待ち時間のどれかが数でなければ出さない（壊れた知らせで「再試行中」を出さない）。
 * `error_status` の `null`（応答が無かった失敗）と数でない値は undefined に畳む。
 * `no_response` の内訳は運ばない（画面は待ち時間しか出さない）。
 */
export function apiRetryEvents(
  message: Readonly<Record<string, unknown>>,
): readonly SessionEvent[] {
  const { attempt, max_retries: maxRetries, retry_delay_ms: retryDelayMs } = message
  if (!isFiniteNumber(attempt) || !isFiniteNumber(maxRetries) || !isFiniteNumber(retryDelayMs)) {
    return []
  }

  return [
    {
      kind: "api-retry",
      retry: {
        attempt,
        maxRetries,
        retryDelayMs,
        errorStatus: isFiniteNumber(message.error_status) ? message.error_status : undefined,
        error: toApiErrorKind(message.error),
      },
    },
  ]
}

/**
 * `rate_limit_event` の `rate_limit_info` を `rate-limit-changed` にする。
 * `status` が3つのどれでもなければ出さない。
 * `resetsAt` は秒で届くのでミリ秒に直す（Claude Code が `resetsAt*1000` で扱っているのを 0.3.280 の同梱の Claude Code で確かめた）。
 * 超過利用（`overage*`）と使用率は運ばない（`RateLimit`）。
 * 「近い」（`allowed_warning`）は読み手が居ないので、状態として持ち回らず `clear` に畳む（`docs/research/plan-usage.md`「論点3」）。
 */
export function rateLimitEvents(info: unknown): readonly SessionEvent[] {
  if (!isPlainObject(info)) {
    return []
  }

  const rateLimit = toRateLimit(info)
  return rateLimit === undefined ? [] : [{ kind: "rate-limit-changed", rateLimit }]
}

function toApiErrorKind(value: unknown): ApiErrorKind {
  return API_ERROR_KINDS.find((kind) => kind === value) ?? "unknown"
}

function toRateLimit(info: Readonly<Record<string, unknown>>): RateLimit | undefined {
  switch (info.status) {
    case "allowed":
    case "allowed_warning":
      return { kind: "clear" }
    case "rejected":
      return {
        kind: "rejected",
        bucket: rateLimitBucket(info.rateLimitType),
        resetsAt: isFiniteNumber(info.resetsAt) ? info.resetsAt * 1000 : undefined,
      }
    default:
      return undefined
  }
}

function rateLimitBucket(value: unknown): RateLimitBucket {
  switch (value) {
    case "five_hour":
      return "five-hour"
    case "seven_day":
    case "seven_day_overage_included":
      return "seven-day"
    case "seven_day_opus":
      return "seven-day-opus"
    case "seven_day_sonnet":
      return "seven-day-sonnet"
    case "overage":
      return "overage"
    default:
      return "other"
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
