// 進行の計測値を記録に残すときの行の形。
// 1行は、閉じた依頼1つ（`conclusion`）か、つまずきからの立ち直り1回（`recovery`）か、
// 仕切りを離した1回（`split`）。
//
// この記録に書いてよいもの:
//
// - 数（ミリ秒・回数）・時刻・セッションID
// - 局面の名前（`ConversationMoment` の値）
// - 仕切りの名前（`SPLIT_DIVIDERS` の固定の3語）と、仕切りの比率（%）
//
// 書かないもの:
//
// - 依頼の文面・セリフ・レポート・ツールの引数と結果は1文字も入らない。
//   型に自由な文字列の口を作らないことで、あとから足せないようにしてある

import { z } from "zod"

/** 行の形の版。形を変えたら上げ、古い行と見分ける。 */
export const EXPERIENCE_METRIC_FORMAT_VERSION = 2 satisfies number

/** 読める版。版1は `split` の行が無い時代の行で、`conclusion`・`recovery` の形は版2と同じ。 */
const readableVersionSchema = z.literal([1, EXPERIENCE_METRIC_FORMAT_VERSION])

/** 会話の画面の3つの仕切り（固定の語彙）。表に並べる順でもある。 */
export const SPLIT_DIVIDERS = [
  "topLeft",
  "rowTop",
  "bottomLeft",
] as const satisfies readonly string[]

export type SplitDivider = (typeof SPLIT_DIVIDERS)[number]

/** 閉じた依頼が行き着いた局面（`ConversationMoment` のうち閉じた2つ）。 */
const closedMomentSchema = z.enum(["deliver", "stumble"])

export type ClosedMoment = z.infer<typeof closedMomentSchema>

const isoAtSchema = z.iso.datetime({ offset: true })

/** 依頼1つを送ってから、そのやり取りが閉じるまで。 */
const conclusionRecordSchema = z
  .object({
    v: readableVersionSchema,
    /** ISO 8601（オフセット付き）。閉じた時刻。 */
    at: isoAtSchema,
    /** claude 側のセッションID。 */
    sessionId: z.string(),
    kind: z.literal("conclusion"),
    moment: closedMomentSchema,
    /** 依頼を送ってから閉じるまで。 */
    untilConclusionMs: z.number(),
    /** そのうち、答え待ち（局面が `ask`）で止まっていた時間の合計。 */
    askingMs: z.number(),
    /** 答え待ちに入った回数（重なったお伺いは1回）。 */
    askCount: z.number(),
  })
  .readonly()

/** つまずいて（局面が `stumble`）から、次に `deliver` で閉じるまで。 */
const recoveryRecordSchema = z
  .object({
    v: readableVersionSchema,
    /** ISO 8601（オフセット付き）。立ち直った時刻。 */
    at: isoAtSchema,
    sessionId: z.string(),
    kind: z.literal("recovery"),
    /** そのあいだに依頼を送った回数と、起こし直した回数の和。 */
    hands: z.number(),
    untilRecoveryMs: z.number(),
  })
  .readonly()

/** 仕切りを離した1回。動かしている途中は書かない。 */
const splitRecordSchema = z
  .object({
    v: z.literal(EXPERIENCE_METRIC_FORMAT_VERSION),
    /** ISO 8601（オフセット付き）。離した時刻。 */
    at: isoAtSchema,
    sessionId: z.string(),
    kind: z.literal("split"),
    divider: z.enum(SPLIT_DIVIDERS),
    /** 離したときの比率（%）。 */
    releasedPercent: z.number(),
    /** 動かす前の比率（%）。 */
    previousPercent: z.number(),
  })
  .readonly()

/** JSONL に書く1行の形。 */
export const experienceMetricRecordSchema = z.discriminatedUnion("kind", [
  conclusionRecordSchema,
  recoveryRecordSchema,
  splitRecordSchema,
])

export type ExperienceMetricRecord = z.infer<typeof experienceMetricRecordSchema>
