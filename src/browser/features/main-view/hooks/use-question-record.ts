// `<QuestionRecord>` のロジック（docs/design.md 2章「機能の中を分ける」の container /
// presenter）。質問ごとに、選択肢と答えの突き合わせ・比べた `preview` の一覧を**画面に出す形**へ
// 畳み、**開くまで preview を描かない**（開いたかどうか）を持つ。
//
// **自由入力の答えは選択肢のどれとも一致しない**ので、選択肢の並びの下に別の行として持たせる
// （`docs/requirements.md` 4.2「許可と質問」）。
//
// **比べた `preview` は答えた後も残す**——答え待ちの札（`question-ask.tsx`）は答えた瞬間に消える
// ので、残さないと「何を比べて決めたか」がログから消える。**開いたままにしないのは、preview が
// 1問あたり数十行になるため**（1回開いたら、閉じても中身は描いたままにする。```chart の
// `<canvas>` は `display: none` の中だと大きさが0のまま描かれ、開いても測り直さないので、閉じた
// まま組み立てると潰れたグラフが残る）。**質問ごとに独立**して開閉するので、開いた索引を
// `Set` で持つ。
//
// **`<details onToggle>` は開閉のたびに発火する**ので、開いたとき（`event.currentTarget.open`）
// だけ拾う——これは React の外（ネイティブの折りたたみ）の出来事の読み替えなので `<details>` の
// DOM 側が真実を持つ（`docs/coding-standards.md`「React」の4類型のうち「外部システムの購読」に
// 準ずる扱い）。

import { useState, type ToggleEvent } from "react"

import { type MainViewQuestion } from "../../../../shared/main-view.ts"
import {
  sortQuestionOptions,
  type Question,
  type QuestionAnswer,
} from "../../../../shared/question.ts"

export type QuestionRecordProps = {
  readonly entry: MainViewQuestion
}

/** 1つの選択肢・自由入力ぶんの答えの行。 */
export type QuestionRecordAnswerRow = {
  readonly key: string
  readonly label: string
  readonly chosen: boolean
  readonly isFreeText: boolean
}

/** 比べた `preview` の1件。 */
export type QuestionRecordPreviewRow = {
  readonly label: string
  readonly preview: string
  readonly chosen: boolean
}

/** 1問ぶんが画面に出す形。 */
export type QuestionRecordQuestionModel = {
  readonly key: string
  readonly header: string
  readonly text: string
  readonly answers: readonly QuestionRecordAnswerRow[]
  /** `preview` を持つ選択肢が1つも無ければ空（折りたたみ自体を出さない）。 */
  readonly previews: readonly QuestionRecordPreviewRow[]
  readonly previewsOpened: boolean
  readonly onTogglePreviews: (event: ToggleEvent<HTMLDetailsElement>) => void
}

export type QuestionRecordModel = {
  readonly questions: readonly QuestionRecordQuestionModel[]
}

export function useQuestionRecord(props: QuestionRecordProps): QuestionRecordModel {
  const [openedIndexes, setOpenedIndexes] = useState<ReadonlySet<number>>(new Set())

  return {
    questions: props.entry.questions.map((question, index) => {
      const answer = props.entry.answers[index] ?? []
      return {
        key: `${question.header}-${String(index)}`,
        header: question.header,
        text: question.text,
        answers: answerRows(question, answer),
        previews: previewRows(question, answer),
        previewsOpened: openedIndexes.has(index),
        onTogglePreviews: (event) => {
          if (event.currentTarget.open) {
            setOpenedIndexes((current) => new Set(current).add(index))
          }
        },
      }
    }),
  }
}

/**
 * 1問ぶんの選択肢と答えの行。**選択肢そのものは札と同じ並び**（ラベルの辞書順。
 * `sortQuestionOptions`）で並べ、選択肢に無い答え（自由入力）は末尾に足す。答えとの突き合わせは
 * ラベル文字列で行うので、並べ替えても選ばれた印は崩れない。
 */
function answerRows(
  question: Question,
  answer: QuestionAnswer,
): readonly QuestionRecordAnswerRow[] {
  const optionRows = sortQuestionOptions(question.options).map((option) => ({
    key: option.label,
    label: option.label,
    chosen: answer.includes(option.label),
    isFreeText: false,
  }))
  const freeTextRows = answer
    .filter((value) => !question.options.some((option) => option.label === value))
    .map((text) => ({ key: text, label: text, chosen: true, isFreeText: true }))
  return [...optionRows, ...freeTextRows]
}

/** 比べた `preview` を持つ選択肢だけ、選択肢と同じ並びで残す。 */
function previewRows(
  question: Question,
  answer: QuestionAnswer,
): readonly QuestionRecordPreviewRow[] {
  return sortQuestionOptions(question.options).flatMap((option) =>
    option.preview === undefined
      ? []
      : [{ label: option.label, preview: option.preview, chosen: answer.includes(option.label) }],
  )
}
