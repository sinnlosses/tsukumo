// 進行の計測値を記録に残すときの行の形（型だけ）。
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

/** 行の形の版。形を変えたら上げ、古い行と見分ける。 */
export const EXPERIENCE_METRIC_FORMAT_VERSION = 2 satisfies number

/** 読める版。版1は `split` の行が無い時代の行で、`conclusion`・`recovery` の形は版2と同じ。 */
export type ReadableFormatVersion = 1 | typeof EXPERIENCE_METRIC_FORMAT_VERSION

/** 閉じた依頼が行き着いた局面（`ConversationMoment` のうち閉じた2つ）。 */
export type ClosedMoment = "deliver" | "stumble"

/** 会話の画面の3つの仕切り（固定の語彙）。表に並べる順でもある。 */
export const SPLIT_DIVIDERS = [
  "topLeft",
  "rowTop",
  "bottomLeft",
] as const satisfies readonly string[]

export type SplitDivider = (typeof SPLIT_DIVIDERS)[number]

/** JSONL に書く1行の形。 */
export type ExperienceMetricRecord = ConclusionRecord | RecoveryRecord | SplitRecord

/** 依頼1つを送ってから、そのやり取りが閉じるまで。 */
export type ConclusionRecord = {
  readonly v: ReadableFormatVersion
  /** ISO 8601（オフセット付き）。閉じた時刻。 */
  readonly at: string
  /** claude 側のセッションID。 */
  readonly sessionId: string
  readonly kind: "conclusion"
  readonly moment: ClosedMoment
  /** 依頼を送ってから閉じるまで。 */
  readonly untilConclusionMs: number
  /** そのうち、答え待ち（局面が `ask`）で止まっていた時間の合計。 */
  readonly askingMs: number
  /** 答え待ちに入った回数（重なったお伺いは1回）。 */
  readonly askCount: number
}

/** つまずいて（局面が `stumble`）から、次に `deliver` で閉じるまで。 */
export type RecoveryRecord = {
  readonly v: ReadableFormatVersion
  /** ISO 8601（オフセット付き）。立ち直った時刻。 */
  readonly at: string
  readonly sessionId: string
  readonly kind: "recovery"
  /** そのあいだに依頼を送った回数と、起こし直した回数の和。 */
  readonly hands: number
  readonly untilRecoveryMs: number
}

/** 仕切りを離した1回。動かしている途中は書かない。 */
export type SplitRecord = {
  readonly v: typeof EXPERIENCE_METRIC_FORMAT_VERSION
  /** ISO 8601（オフセット付き）。離した時刻。 */
  readonly at: string
  readonly sessionId: string
  readonly kind: "split"
  readonly divider: SplitDivider
  /** 離したときの比率（%）。 */
  readonly releasedPercent: number
  /** 動かす前の比率（%）。 */
  readonly previousPercent: number
}
