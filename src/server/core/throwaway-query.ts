// 使い捨ての問い合わせ（会話とは別に起こす1回限りの `query()`）の種類と、1回ぶんの足跡と記録の行の形、
// 続けて落ちた問い合わせの契機を鍵ごとに間引く勘定と、鍵ごとの錠の形。
//
// 足跡と記録に書いてよいのは、種類・開始の時刻・所要・入出力トークン・結果の種類だけ。
// 依頼の文面・指示文・応答は型に文字列の口を持たせず、あとから足せないようにしてある。

import { z } from "zod"

/** 使い捨ての問い合わせの種類。 */
const THROWAWAY_QUERY_KINDS = [
  "diary",
  "chat-consolidation",
  "recommendation",
  "welcome-greeting",
  "welcome-reactions",
  "character-generation",
  "usage-review",
  "usage-proposal",
  "pair-judge",
] as const

export type ThrowawayQueryKind = (typeof THROWAWAY_QUERY_KINDS)[number]

/** result が届いた回の結果。成功か、SDK の result の失敗の `subtype`（知らない語は `other`）。 */
export const THROWAWAY_QUERY_RESULT_OUTCOMES = [
  "success",
  "error_during_execution",
  "error_max_turns",
  "error_max_budget_usd",
  "error_max_structured_output_retries",
  "other",
] as const

export type ThrowawayQueryResultOutcome = (typeof THROWAWAY_QUERY_RESULT_OUTCOMES)[number]

/**
 * result が届かずに終わった回。
 *
 * - `aborted`: 中断されて投げた
 * - `threw`: 中断されずに投げた（起こせない・API の失敗など）
 * - `no-result`: 投げずに流れが終わった
 */
const THROWAWAY_QUERY_UNFINISHED_OUTCOMES = ["aborted", "threw", "no-result"] as const

export type ThrowawayQueryUnfinishedOutcome = (typeof THROWAWAY_QUERY_UNFINISHED_OUTCOMES)[number]

/** `query()` 1回ぶんの足跡。トークンは result が届いた回だけ持つ。 */
export type ThrowawayQueryFootprint =
  | {
      readonly kind: ThrowawayQueryKind
      /** 起こした時刻（エポックミリ秒）。 */
      readonly startedAt: number
      readonly durationMs: number
      readonly outcome: ThrowawayQueryResultOutcome
      /** 全モデルの入力トークンの和（キャッシュの読み・書きを含む）。 */
      readonly inputTokens: number
      readonly outputTokens: number
    }
  | {
      readonly kind: ThrowawayQueryKind
      readonly startedAt: number
      readonly durationMs: number
      readonly outcome: ThrowawayQueryUnfinishedOutcome
    }

/** 足跡を1回ぶん受け取る口。書けなくても例外を投げない。 */
export type ThrowawayQueryRecorder = (footprint: ThrowawayQueryFootprint) => void

/** 行の形の版。形を変えたら上げ、古い行と見分ける。 */
export const THROWAWAY_QUERY_FORMAT_VERSION = 1

const recordBaseShape = {
  v: z.literal(THROWAWAY_QUERY_FORMAT_VERSION),
  kind: z.enum(THROWAWAY_QUERY_KINDS),
  /** ISO 8601（オフセット付き）。起こした時刻。 */
  startedAt: z.iso.datetime({ offset: true }),
  durationMs: z.number(),
}

/** 記録の1行。 */
export const throwawayQueryRecordSchema = z.union([
  z.strictObject({
    ...recordBaseShape,
    outcome: z.enum(THROWAWAY_QUERY_RESULT_OUTCOMES),
    inputTokens: z.number(),
    outputTokens: z.number(),
  }),
  z.strictObject({
    ...recordBaseShape,
    outcome: z.enum(THROWAWAY_QUERY_UNFINISHED_OUTCOMES),
  }),
])

export type ThrowawayQueryRecord = z.infer<typeof throwawayQueryRecordSchema>

/**
 * 間引きの数。続けて落ちた回数が `failuresBeforeBackoff` に届いたら、そのあとの契機を 2 回飛ばす。
 * 落ちるたびに倍にし、`maxSkips` で頭打ちにする。
 */
export type QueryBackoffPolicy = {
  readonly failuresBeforeBackoff: number
  readonly maxSkips: number
}

/**
 * 1回の結果が勘定に効く向き。
 *
 * - `count`: 続けて落ちた回数を1増やし、飛ばす回数を決め直す
 * - `reset`: 0 に戻す
 * - `keep`: 動かさない
 */
export type QueryBackoffEffect = "count" | "reset" | "keep"

/** 鍵（呼ぶ側が決める粒。定着ならパック名）ごとの間引きの勘定。 */
export type QueryBackoff<K extends string> = {
  /** この契機を飛ばすか。飛ばすときは残りの回数を1減らす。 */
  readonly holdsBack: (key: K) => boolean
  readonly note: (key: K, effect: QueryBackoffEffect) => void
}

/** {@link QueryLockPort} が取れたときの錠。 */
export type QueryLock = {
  /** 錠を外す。外せなくても例外は投げない。 */
  readonly release: () => void
}

/**
 * 鍵（呼ぶ側が決める粒。定着ならパック名）ごとの錠を取る口。プロセスをまたいで1本だけが取れる。
 * 取れなければ undefined（ほかの誰かが走らせている）。
 * 書いてから `staleAfterMs` を過ぎた錠は、落ちたプロセスの残りとして消して取り直す。
 */
export type QueryLockPort<K extends string> = (
  key: K,
  staleAfterMs: number,
  now: Temporal.Instant,
) => QueryLock | undefined

type BackoffTally = {
  readonly failures: number
  readonly skipsLeft: number
}

/** 勘定はプロセスのメモリにだけ持つ（起こし直すと 0 から数え直す）。 */
export function createQueryBackoff<K extends string>(policy: QueryBackoffPolicy): QueryBackoff<K> {
  const tallies = new Map<string, BackoffTally>()
  return {
    holdsBack: (key) => {
      const tally = tallies.get(key)
      if (tally === undefined || tally.skipsLeft === 0) {
        return false
      }
      tallies.set(key, { ...tally, skipsLeft: tally.skipsLeft - 1 })
      return true
    },
    note: (key, effect) => {
      if (effect === "keep") {
        return
      }
      if (effect === "reset") {
        tallies.delete(key)
        return
      }
      const failures = (tallies.get(key)?.failures ?? 0) + 1
      tallies.set(key, { failures, skipsLeft: skipsAfter(policy, failures) })
    },
  }
}

function skipsAfter(policy: QueryBackoffPolicy, failures: number): number {
  const over = failures - policy.failuresBeforeBackoff
  if (over < 0) {
    return 0
  }
  return Math.min(2 ** (over + 1), policy.maxSkips)
}
