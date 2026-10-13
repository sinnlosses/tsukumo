// 迎えの挨拶か反応の行の書き込み1回の足跡（`welcome-writing`）の形。書けたときも書けなかったときも1行で、
// 所要と各回の結果と検査落ちの理由の語だけを持つ。書いた文も `error.message` も持たない。

import { z } from "zod"

/**
 * 答えが検査に落ちた理由。
 *
 * - `missing`: 欠け（オブジェクトでない・欄が無い・文字列でない）
 * - `empty`: 空
 * - `newline`: 改行を含む
 * - `too-long`: 字数の上限を超える
 * - `mark-count`: 差し込み口の数が違う
 * - `unknown-expression`: 表情の選択肢に無い表情
 * - `repeated`: 直近の挨拶と同じ文
 */
export const WELCOME_REJECTIONS = [
  "missing",
  "empty",
  "newline",
  "too-long",
  "mark-count",
  "unknown-expression",
  "repeated",
] as const

export type WelcomeRejection = (typeof WELCOME_REJECTIONS)[number]

/** 書いたもの（迎えの挨拶か、反応の行か）。 */
export const WELCOME_WRITING_TARGETS = ["greeting", "reactions"] as const

/** 問い合わせ1回、または書き込み全体の結果。`timed-out` は締め切りで中断した問い合わせ。 */
export const WELCOME_WRITING_RESULTS = ["written", "failed", "rejected", "timed-out"] as const

export type WelcomeWritingResult = (typeof WELCOME_WRITING_RESULTS)[number]

const welcomeAttemptTraceSchema = z.union([
  z.object({
    result: z.literal("rejected"),
    reason: z.enum(WELCOME_REJECTIONS),
    ms: z.number(),
  }),
  z.object({
    result: z.enum(["written", "failed", "timed-out", "superseded"]),
    ms: z.number(),
  }),
])

/** 問い合わせ1回の結果と所要。検査に落ちた回だけ理由を持つ。`superseded` は先に書けた別の回に負けて中断した回。 */
export type WelcomeAttemptTrace = Readonly<z.infer<typeof welcomeAttemptTraceSchema>>

export const welcomeWritingFootprintSchema = z.object({
  flow: z.literal("welcome-writing"),
  /** 書き終えた時刻（エポックミリ秒）。 */
  at: z.number(),
  target: z.enum(WELCOME_WRITING_TARGETS),
  /** 書き込み全体の結果（最後の回の結果）。 */
  outcome: z.enum(WELCOME_WRITING_RESULTS),
  /** 書き始めから書き終えるまで（問い合わせ直しを含む）。 */
  durationMs: z.number(),
  /** 問い合わせた順の各回。 */
  attempts: z.array(welcomeAttemptTraceSchema).readonly(),
})

/** 迎えの挨拶か反応の行の書き込みを1回終えたこと（中断したものは書かない）。 */
export type WelcomeWritingFootprint = Readonly<z.infer<typeof welcomeWritingFootprintSchema>>
