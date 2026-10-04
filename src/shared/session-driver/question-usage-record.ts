// 質問（`AskUserQuestion`）の使われ方の記録の行の形。1行 = 答えが確定した質問1件。
// 書いてよいのは時刻・セッションID・選択肢の数だけで、質問文・ラベル・`description` は入れない。

/** 行の形の版。形を変えたら上げ、古い行と見分ける。 */
export const QUESTION_USAGE_FORMAT_VERSION = 1 satisfies number

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
}
