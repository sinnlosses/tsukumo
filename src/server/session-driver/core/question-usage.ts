// 質問（`AskUserQuestion`）の使われ方の記録1行ぶんの中身。
// 持つのは選択肢の数と preview の付いた数だけで、質問文・ラベル・`description` は入れない。

import type { Question } from "../../../shared/session-driver/question.ts"

export type QuestionUsageEntry = {
  readonly at: number
  readonly sessionId: string
  /** その質問の選択肢の数。 */
  readonly optionCount: number
  /** その質問の選択肢のうち、`preview` が付いたものの数。 */
  readonly previewCount: number
}

/** 書けなくても例外を投げない。 */
export type QuestionUsageLog = {
  readonly append: (entry: QuestionUsageEntry) => void
}

/** 答えが確定した質問（`question-answered`）から、記録1行ぶんの中身を質問ごとに作る。 */
export function questionUsageEntriesOf(
  questions: readonly Question[],
  sessionId: string,
  at: number,
): readonly QuestionUsageEntry[] {
  return questions.map((question) => ({
    at,
    sessionId,
    optionCount: question.options.length,
    previewCount: question.options.filter((option) => option.preview !== undefined).length,
  }))
}
