// メインビューに残す**質問の記録**。「何を聞いて、どう答えたか」を1つの塊で出す
// （ユーザーの決定 2026-09-10）。選ばれた答えには印を付ける。**答えが分からないとき**
// （利用者が質問を差し戻したときなど）は、印を付けずに選択肢だけを出す。

import { type ReactElement } from "react"

import { type MainViewQuestion } from "../../protocol/main-view.ts"

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
          <ul className="question-options">
            {question.options.map((option) => {
              const chosen = props.entry.answers.includes(option.label)
              return (
                <li className={`question-option${chosen ? " is-chosen" : ""}`} key={option.label}>
                  {chosen ? "●" : "○"} {option.label}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
