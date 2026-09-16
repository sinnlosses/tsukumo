// メインビューに残す**質問の記録**。「何を聞いて、どう答えたか」を1つの塊で出す
// （ユーザーの決定 2026-09-10）。選ばれた答えには印を付ける。**答えが分からないとき**
// （利用者が質問を差し戻したときなど）は、印を付けずに選択肢だけを出す。
//
// **自由入力の答えは選択肢のどれとも一致しない**ので、選択肢の並びの下に別の行として足す
// （2026-09-16 決定。`docs/requirements.md` 4.2「許可と質問」）。複数選択の答えは
// 質問ごとの並び（`QuestionAnswer`）でそのまま届くので、印が付く行が複数になる。

import { type ReactElement } from "react"

import { type MainViewQuestion } from "../../../protocol/main-view.ts"
import { type Question, type QuestionAnswer } from "../../../protocol/question.ts"

export type QuestionRecordProps = {
  readonly entry: MainViewQuestion
}

export function QuestionRecord(props: QuestionRecordProps): ReactElement {
  return (
    <section className="tool-block tool-block-question">
      {props.entry.questions.map((question, index) => (
        <div className="question-record" key={`${question.header}-${String(index)}`}>
          <h4>
            {question.header}: {question.text}
          </h4>
          <QuestionAnswers question={question} answer={props.entry.answers[index] ?? []} />
        </div>
      ))}
    </section>
  )
}

/** 1問ぶんの選択肢と答え。選択肢に無い答え（自由入力）は並びの末尾に足す。 */
function QuestionAnswers(props: {
  readonly question: Question
  readonly answer: QuestionAnswer
}): ReactElement {
  const freeTexts = props.answer.filter(
    (answer) => !props.question.options.some((option) => option.label === answer),
  )

  return (
    <ul className="question-options">
      {props.question.options.map((option) => {
        const chosen = props.answer.includes(option.label)
        return (
          <li className={`question-option${chosen ? " is-chosen" : ""}`} key={option.label}>
            {chosen ? "●" : "○"} {option.label}
          </li>
        )
      })}
      {freeTexts.map((text) => (
        <li className="question-option is-chosen is-free-text" key={text}>
          ● {text}（自由入力）
        </li>
      ))}
    </ul>
  )
}
