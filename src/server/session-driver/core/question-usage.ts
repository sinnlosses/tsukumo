// 質問（`AskUserQuestion`）の使われ方の記録1行ぶんの中身。
// 持つのは選択肢の数・preview の付いた数・添え書きの有無・断った回数だけで、質問文・ラベル・`description`・添え書きの字は入れない。

import type { Question } from "../../../shared/session-driver/question.ts"

export type QuestionUsageEntry = {
  readonly at: number
  readonly sessionId: string
  /** その質問の選択肢の数。 */
  readonly optionCount: number
  /** その質問の選択肢のうち、`preview` が付いたものの数。 */
  readonly previewCount: number
  /** その質問に合う添え書きが付いていたか。 */
  readonly briefed: boolean
  /** その質問が答えられるまでに添え書きの不足で断った回数。 */
  readonly sentBack: number
}

/** 書けなくても例外を投げない。 */
export type QuestionUsageLog = {
  readonly append: (entry: QuestionUsageEntry) => void
}

/** 答えが確定した質問（`question-answered`）の、記録に使う部分。 */
export type AnsweredQuestions = {
  readonly questions: readonly Question[]
  readonly briefed: readonly boolean[]
  readonly sentBack: number
}

/**
 * 答えが確定した質問から、記録1行ぶんの中身を質問ごとに作る。
 * 断った回数は1回の答えにつき1つなので、先頭の質問の行にだけ入れる（行を足し合わせると全体の回数になる）。
 */
export function questionUsageEntriesOf(
  answered: AnsweredQuestions,
  sessionId: string,
  at: number,
): readonly QuestionUsageEntry[] {
  return answered.questions.map((question, index) => ({
    at,
    sessionId,
    optionCount: question.options.length,
    previewCount: question.options.filter((option) => option.preview !== undefined).length,
    briefed: answered.briefed[index] ?? false,
    sentBack: index === 0 ? answered.sentBack : 0,
  }))
}
