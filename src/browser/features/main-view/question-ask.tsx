// **答え待ちの質問の札**（メインビューの、いまのやり取りのレポートの下）。
// 頭に「質問」のチップと `header`・右端に
// 「n / N」、本文の下に選択肢を横に並べたカード（選んだカードの枠が `--state-warn`）、
// 下端に「選択肢にない答えは、下の入力欄に書いて送れます」と「これで答える」を置く。
//
// **以前は入力欄の上の狭い箱が質問を持ち、`preview`（Markdown）だけをメインビューの
// 「比べる面」に出していた**（`pending-question.tsx`）。札をメインビューへ移したので面は
// 要らなくなり、`preview` は**選択肢の説明の下**にそのまま入る。
//
// **選択の状態と進み方は `stores/question-answer.tsx` が持つ**（自由入力を担う入力欄
// （`features/dispatch/`）と同じ1つの答えを組み立てるため。`browser/` の機能どうしは
// import できない。docs/design.md 2章 / 6.2）。ここは受け取った行を置くだけで、判定を持たない。
//
// **質問の本文は会話の内容そのもの**なので、ここから外へ出す経路は作らない
// （`docs/coding-standards.md`「会話内容の扱い」）。
//
// **札まで連れてくるスクロールは `hooks/use-question-ask-scroll.ts`**（外の世界に触るフックだけが
// 余分。docs/design.md 2章「機能の中を分ける」）。

import { type ReactElement } from "react"

import { useQuestionAnswer, type QuestionOptionRow } from "../../stores/question-answer.tsx"
import { useQuestionScroll } from "../../stores/question-scroll.tsx"
import { useTurnSelection } from "../../stores/turn-selection.tsx"
import { useQuestionAskScroll } from "./hooks/use-question-ask-scroll.ts"
import { Markdown } from "./markdown/markdown.tsx"
import notationStyles from "./markdown/report-notation.module.css"
import styles from "./question-ask.module.css"

const QUESTION_CHIP = "質問"
const BACK_LABEL = "戻る"
const FREE_TEXT_HINT = "選択肢にない答えは、下の入力欄に書いて送れます"
const RECOMMENDED_BADGE = "おすすめ"
const ANSWER_LABEL = "これで答える"
const NEXT_LABEL = "次へ"
/** 単一選択の radio をひとまとまりにする名前（札は1問ずつしか出ないので1つで足りる）。 */
const OPTION_GROUP_NAME = "question-ask-option"
const TO_NEWEST_LABEL = "最新のやり取りへ"
/** 入力欄に書いて記録した答え（まだ送っていない問のぶん）の前置き。 */
const WRITTEN_ANSWER_PREFIX = "入力欄に書いた答え: "

export function QuestionAsk(): ReactElement | null {
  const question = useQuestionAnswer()
  // 過去のやり取りを見ている間も札は出す（答えは待たせたままにできない）。そのときだけ、
  // 質問が**いまのやり取り**のものだと分かるように戻る口を添える。
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  const { signal: scrollSignal } = useQuestionScroll()
  const askId = question.kind === "asking" ? question.id : undefined
  const cardRef = useQuestionAskScroll(askId, scrollSignal)

  if (question.kind === "none") {
    return null
  }

  const showToNewest =
    newestTurnId !== undefined && activeTurnId !== undefined && activeTurnId !== newestTurnId

  return (
    <section className={styles["question-ask"]} ref={cardRef}>
      <header className={styles["question-ask-head"]}>
        <span className={styles["question-ask-chip"]}>{QUESTION_CHIP}</span>
        <span className={styles["question-ask-header"]}>{question.header}</span>
        {showToNewest && (
          <button
            type="button"
            className={styles["question-ask-to-newest"]}
            onClick={() => selectTurn(newestTurnId)}
          >
            {TO_NEWEST_LABEL}
          </button>
        )}
        {question.showBack && (
          <button type="button" className={styles["question-ask-back"]} onClick={question.onBack}>
            {BACK_LABEL}
          </button>
        )}
        <span className={styles["question-ask-progress"]}>{question.progressLabel}</span>
      </header>
      <p className={styles["question-ask-text"]}>{question.text}</p>
      <ul className={styles["question-ask-options"]}>
        {question.options.map((option) => (
          <QuestionOption
            option={option}
            multiSelect={question.multiSelect}
            onToggle={question.onToggle}
            key={option.label}
          />
        ))}
      </ul>
      {question.writtenAnswer !== "" && (
        <p className={styles["question-ask-written"]}>
          {WRITTEN_ANSWER_PREFIX}
          {question.writtenAnswer}
        </p>
      )}
      <footer className={styles["question-ask-foot"]}>
        <span className={styles["question-ask-hint"]}>{FREE_TEXT_HINT}</span>
        <button
          type="button"
          className={styles["question-ask-answer"]}
          disabled={!question.canAnswer}
          onClick={question.onAnswer}
        >
          {question.last ? ANSWER_LABEL : NEXT_LABEL}
        </button>
      </footer>
    </section>
  )
}

/**
 * 選択肢1つぶんのカード。**押す口は `<input>` と `<label>` の組**（単一選択は radio、
 * **複数選択はチェックボックス**。`docs/display.md` 4.2）で、説明と `preview` は
 * その外に置く——`preview` は表や図になるので、`<label>`（中身は文字の並びだけ）にも
 * `<button>` にも入れられない。
 */
function QuestionOption(props: {
  readonly option: QuestionOptionRow
  readonly multiSelect: boolean
  readonly onToggle: (label: string) => void
}): ReactElement {
  const { option } = props

  return (
    <li
      className={`${styles["question-ask-option"]}${
        option.selected ? ` ${styles["is-selected"]}` : ""
      }`}
    >
      <label className={styles["question-ask-option-choose"]}>
        <input
          type={props.multiSelect ? "checkbox" : "radio"}
          name={props.multiSelect ? undefined : OPTION_GROUP_NAME}
          className={styles["question-ask-option-mark"]}
          checked={option.selected}
          onChange={() => props.onToggle(option.label)}
        />
        <span className={styles["question-ask-option-label"]}>{option.text}</span>
        {option.recommended && (
          <span className={styles["question-ask-option-badge"]}>{RECOMMENDED_BADGE}</span>
        )}
      </label>
      {option.description !== "" && (
        <p className={styles["question-ask-option-description"]}>{option.description}</p>
      )}
      {option.preview !== undefined && (
        // レポートと同じ見た目の語彙（`.detail-block` の子のセレクタ。
        // `markdown/report-notation.module.css`）に乗せる。**`.question-ask-option .detail-block`
        // の余白の打ち消し（`question-ask.module.css`）は CSS Modules が class 名をファイルごとに
        // ハッシュ化するため、そちらの `.detail-block`（この選択子のためだけの空の再定義）も
        // 一緒に付ける**（`components/portrait.module.css` の `.portrait` と同じ手口。
        // docs/design.md 6.6）。
        <div className={`${notationStyles["detail-block"]} ${styles["detail-block"]}`}>
          <Markdown text={option.preview} />
        </div>
      )}
    </li>
  )
}
