// メインビューに残す**質問の記録**。「何を聞いて、どう答えたか」を1つの塊で出す
// （ユーザーの決定 2026-09-10）。選ばれた答えには印を付ける。**答えが分からないとき**
// （利用者が質問を差し戻したときなど）は、印を付けずに選択肢だけを出す。
//
// **自由入力の答えは選択肢のどれとも一致しない**ので、選択肢の並びの下に別の行として足す
// （2026-09-16 決定。`docs/requirements.md` 4.2「許可と質問」）。複数選択の答えは
// 質問ごとの並び（`QuestionAnswer`）でそのまま届くので、印が付く行が複数になる。
//
// **比べた `preview` は折りたたんで残す**（2026-09-21 決定）。答え待ちの面
// （`pending-question.tsx`）は答えた瞬間に消えるので、残さないと「何を比べて決めたか」が
// ログから消える。開いたままにしないのは、preview が1問あたり数十行になるため。

import { useState, type ReactElement } from "react"

import { type MainViewQuestion } from "../../../shared/main-view.ts"
import {
  sortQuestionOptions,
  type Question,
  type QuestionAnswer,
} from "../../../shared/question.ts"
import styles from "./main-view.module.css"
import { Markdown } from "./markdown/markdown.tsx"

export type QuestionRecordProps = {
  readonly entry: MainViewQuestion
}

export function QuestionRecord(props: QuestionRecordProps): ReactElement {
  return (
    <section className={`${styles["tool-block"]} ${styles["tool-block-question"]}`}>
      {props.entry.questions.map((question, index) => (
        <div className={styles["question-record"]} key={`${question.header}-${String(index)}`}>
          <h4>
            {question.header}: {question.text}
          </h4>
          <QuestionAnswers question={question} answer={props.entry.answers[index] ?? []} />
          <QuestionPreviews question={question} answer={props.entry.answers[index] ?? []} />
        </div>
      ))}
    </section>
  )
}

/**
 * 1問ぶんの選択肢と答え。選択肢に無い答え（自由入力）は並びの末尾に足す。**選択肢そのものは
 * 箱と同じ並び**（ラベルの辞書順。`sortQuestionOptions`）で出す。答えとの突き合わせは
 * ラベル文字列で行うので、並べ替えても選ばれた印は崩れない。
 */
function QuestionAnswers(props: {
  readonly question: Question
  readonly answer: QuestionAnswer
}): ReactElement {
  const freeTexts = props.answer.filter(
    (answer) => !props.question.options.some((option) => option.label === answer),
  )

  return (
    <ul className={styles["question-options"]}>
      {sortQuestionOptions(props.question.options).map((option) => {
        const chosen = props.answer.includes(option.label)
        return (
          <li
            className={`${styles["question-option"]}${chosen ? ` ${styles["is-chosen"]}` : ""}`}
            key={option.label}
          >
            {chosen ? "●" : "○"} {option.label}
          </li>
        )
      })}
      {freeTexts.map((text) => (
        <li
          className={`${styles["question-option"]} ${styles["is-chosen"]} ${styles["is-free-text"]}`}
          key={text}
        >
          ● {text}（自由入力）
        </li>
      ))}
    </ul>
  )
}

/**
 * 比べた `preview` の折りたたみ。`preview` を持つ選択肢が1つも無い質問では何も描かない
 * （答え待ちの面と同じ判断。常設の枠にしない）。
 *
 * **開くまで中身を描かない。** ```chart の `<canvas>` は `display: none` の中だと大きさが 0 の
 * まま描かれ、開いても測り直さないので、閉じたまま組み立てると潰れたグラフが残る。一度開いた
 * あとは閉じても外さない（開き直すたびに図とグラフを描き直さないため）。
 */
function QuestionPreviews(props: {
  readonly question: Question
  readonly answer: QuestionAnswer
}): ReactElement | null {
  const [opened, setOpened] = useState(false)

  const previews = sortQuestionOptions(props.question.options).flatMap((option) =>
    option.preview === undefined
      ? []
      : [
          {
            label: option.label,
            preview: option.preview,
            chosen: props.answer.includes(option.label),
          },
        ],
  )
  if (previews.length === 0) {
    return null
  }

  return (
    <details
      className={styles["question-previews"]}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setOpened(true)
        }
      }}
    >
      <summary>比べた内容</summary>
      {opened
        ? previews.map((preview) => (
            // レポートと同じ見た目の語彙（`.detail-block` の子のセレクタ）に乗せる。
            <div className={styles["detail-block"]} key={preview.label}>
              <p className={styles["question-preview-label"]}>
                {preview.chosen ? "●" : "○"} {preview.label}
              </p>
              <Markdown text={preview.preview} />
            </div>
          ))
        : null}
    </details>
  )
}
