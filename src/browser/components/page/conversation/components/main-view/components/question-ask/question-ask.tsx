// 答え待ちの質問の札（メインビューの、いまのやり取りのレポートの下）。
// 頭に「質問」のチップと `header`・右端に「n / N」、本文の下に選択肢を横に並べたカード、下端に自由入力の案内と「これで答える」を置く。
// `preview` は選択肢の説明の下にそのまま入る。
//
// 選択の状態と進み方は `useQuestionAnswer` が持つ（自由入力を担う入力欄と同じ1つの答えを組み立てるため）。
//
// 質問の本文は会話の内容そのものなので、ここから外へ出す経路は作らない。

import clsx from "clsx"
import type { ReactElement } from "react"

import {
  useQuestionAnswer,
  type QuestionOptionRow,
} from "../../../../../../../stores/question-answer.ts"
import { useQuestionScroll } from "../../../../../../../stores/question-scroll.ts"
import { useTurnSelection } from "../../../../../../../stores/turn-selection.ts"
import { Button } from "../../../../../../ui/button/button.tsx"
import { HStack } from "../../../../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { Markdown } from "../../markdown/markdown.tsx"
import notationStyles from "../../markdown/report-notation.module.css"
import { useQuestionAskScroll } from "./hooks/use-question-ask-scroll.ts"
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
  // 過去のやり取りを見ている間も札は出す（答えは待たせたままにできない）。
  // そのときだけ、質問がいまのやり取りのものだと分かるように戻る口を添える。
  const { activeTurnId, newestTurnId, selectTurn } = useTurnSelection()
  const scrollSignal = useQuestionScroll((state) => state.signal)
  const askId = question.kind === "asking" ? question.id : undefined
  const cardRef = useQuestionAskScroll(askId, scrollSignal)

  if (question.kind === "none") {
    return null
  }

  const showToNewest =
    newestTurnId !== undefined && activeTurnId !== undefined && activeTurnId !== newestTurnId

  return (
    <section className={styles["question-ask"]} ref={cardRef}>
      <HStack
        element="header"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="center"
        justify="start"
        wrap="wrap"
        className={styles["question-ask-head"]}
      >
        <span className={styles["question-ask-chip"]}>{QUESTION_CHIP}</span>
        <Text
          element="span"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["question-ask-header"]}
        >
          {question.header}
        </Text>
        {showToNewest && (
          <Button
            variant="outline-hover-warn"
            size="label"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["question-ask-to-newest"]}
            onClick={() => selectTurn(newestTurnId)}
          >
            {TO_NEWEST_LABEL}
          </Button>
        )}
        {question.showBack && (
          <Button
            variant="outline-hover-warn"
            size="label"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["question-ask-back"]}
            onClick={question.onBack}
          >
            {BACK_LABEL}
          </Button>
        )}
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["question-ask-progress"]}
        >
          {question.progressLabel}
        </Text>
      </HStack>
      <Text
        element="p"
        size="inherit"
        tone="inherit"
        weight="bold"
        className={styles["question-ask-text"]}
      >
        {question.text}
      </Text>
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
        <Text
          element="p"
          size="secondary"
          tone="state-warn"
          weight="inherit"
          className={styles["question-ask-written"]}
        >
          {WRITTEN_ANSWER_PREFIX}
          {question.writtenAnswer}
        </Text>
      )}
      <HStack
        element="footer"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="center"
        justify="between"
        wrap="wrap"
        className={styles["question-ask-foot"]}
      >
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["question-ask-hint"]}
        >
          {FREE_TEXT_HINT}
        </Text>
        <Button
          variant="solid-warn"
          size="secondary"
          pressed="none"
          disabled={!question.canAnswer}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["question-ask-answer"]}
          onClick={question.onAnswer}
        >
          <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
            {question.last ? ANSWER_LABEL : NEXT_LABEL}
          </Text>
        </Button>
      </HStack>
    </section>
  )
}

/**
 * 選択肢1つぶんのカード。押す口は `<input>` と `<label>` の組（単一選択は radio、複数選択はチェックボックス）。
 * 説明と `preview` はその外に置く（`preview` は表や図になるので、`<label>` にも `<button>` にも入れられない）。
 */
function QuestionOption(props: {
  readonly option: QuestionOptionRow
  readonly multiSelect: boolean
  readonly onToggle: (label: string) => void
}): ReactElement {
  const { option } = props

  return (
    <li className={clsx(styles["question-ask-option"], option.selected && styles["is-selected"])}>
      <HStack
        element="label"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="baseline"
        justify="start"
        wrap="nowrap"
        className={styles["question-ask-option-choose"]}
      >
        <input
          type={props.multiSelect ? "checkbox" : "radio"}
          name={props.multiSelect ? undefined : OPTION_GROUP_NAME}
          className={styles["question-ask-option-mark"]}
          checked={option.selected}
          onChange={() => props.onToggle(option.label)}
        />
        <Text
          element="span"
          size="inherit"
          tone="inherit"
          weight="bold"
          className={styles["question-ask-option-label"]}
        >
          {option.text}
        </Text>
        {option.recommended && (
          <Text
            element="span"
            size="label"
            tone="state-warn"
            weight="inherit"
            className={styles["question-ask-option-badge"]}
          >
            {RECOMMENDED_BADGE}
          </Text>
        )}
      </HStack>
      {option.description !== "" && (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["question-ask-option-description"]}
        >
          {option.description}
        </Text>
      )}
      {option.preview !== undefined && (
        // レポートと同じ見た目（report-notation.module.css の `.detail-block` の子のセレクタ）に乗せる。
        // `.question-ask-option .detail-block` の余白の打ち消し（question-ask.module.css）は、CSS Modules が class 名をファイルごとにハッシュ化するので、そちらの `.detail-block`（この選択子のためだけの空の再定義）も一緒に付ける。
        <div className={clsx(notationStyles["detail-block"], styles["detail-block"])}>
          <Markdown text={option.preview} />
        </div>
      )}
    </li>
  )
}
