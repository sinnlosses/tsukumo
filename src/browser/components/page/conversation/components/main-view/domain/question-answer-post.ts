// 答えた質問を、利用者の投稿として出す中身にする。
// `question` の記録は時刻を持たないので、時刻は扱わない。

import type { QuestionAnswer } from "../../../../../../../shared/session-driver/question.ts"
import type { MainViewQuestion } from "../../../../../../../shared/session/main-view-shape.ts"

const ANSWER_STAMP = "答え"
const ENTRUSTED_STAMP = "任せた"
const LABEL_SEPARATOR = "、"
const REDO_PREFIX = "（答え直し）"
const NO_ANSWER: QuestionAnswer = { kind: "chosen", labels: [] }

export type AnswerPost = {
  readonly stamp: typeof ANSWER_STAMP | typeof ENTRUSTED_STAMP
  /** 問ごとの行。問が1つなら答えだけ、2つ以上なら「題: 答え」。 */
  readonly lines: readonly string[]
}

export function answerPostOf(entry: MainViewQuestion): AnswerPost {
  const single = entry.questions.length === 1
  const lines = entry.questions.map((question, index) => {
    const answer = answerText(entry.answers[index] ?? NO_ANSWER)
    return single ? answer : `${question.header}: ${answer}`
  })
  return {
    stamp: entry.answers.some((answer) => answer.kind === "entrusted")
      ? ENTRUSTED_STAMP
      : ANSWER_STAMP,
    lines,
  }
}

/** 訂正の補足の下書き。問ごとに1行。 */
export function redoDraftOf(entry: MainViewQuestion): string {
  return entry.questions.map((question) => `${REDO_PREFIX}${question.header}: `).join("\n")
}

function answerText(answer: QuestionAnswer): string {
  return answer.kind === "entrusted" ? ENTRUSTED_STAMP : answer.labels.join(LABEL_SEPARATOR)
}
