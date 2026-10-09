// 質問（`AskUserQuestion`）の使われ方の記録の行の形。1行 = 答えが確定した質問1件。
// 書いてよいのは時刻・セッションID・選択肢の数・添え書きの有無・断った回数だけで、質問文・ラベル・`description`・添え書きの字は入れない。

/** 行の形の版。形を変えたら上げ、古い行と見分ける。版1には `briefed` と `sentBack` が無い。 */
export const QUESTION_USAGE_FORMAT_VERSION = 2 satisfies number

export type QuestionUsageRecord = {
  readonly v: typeof QUESTION_USAGE_FORMAT_VERSION
  /** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
  readonly at: string
  /** claude 側のセッションID。 */
  readonly sessionId: string
  /** その質問の選択肢の数。 */
  readonly optionCount: number
  /** その質問の選択肢のうち、`preview` が付いたものの数。 */
  readonly previewCount: number
  /** その質問に合う添え書きが付いていたか。 */
  readonly briefed: boolean
  /** その質問が答えられるまでに添え書きの不足で断った回数。複数の質問を一度に聞いたときは先頭の質問の行だけが持つ。 */
  readonly sentBack: number
}
