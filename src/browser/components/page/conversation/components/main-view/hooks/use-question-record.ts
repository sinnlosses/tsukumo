// `<QuestionRecord>` のロジック。
// 質問ごとに、選択肢と答えの突き合わせ・比べた `preview` の一覧を画面に出す形へ畳み、開いたかどうかを持つ。
//
// 自由入力の答えは選択肢のどれとも一致しないので、選択肢の並びの下に別の行として持たせる。
//
// 比べた `preview` は答えた後も残す（答え待ちのカードは答えた瞬間に消えるので、残さないと「何を比べて決めたか」がログから消える）。
// 開いたままにしないのは、preview が1問あたり数十行になるため。
// 1回開いたら、閉じても中身は描いたままにする。
// ```chart の `<canvas>` は `display: none` の中だと大きさが0のまま描かれ、開いても測り直さないので、閉じたまま組み立てると潰れたグラフが残る。
// 質問ごとに独立して開閉するので、開いた索引を `Set` で持つ。質問のときの添え書きの畳みも同じ作りで、索引は `preview` の畳みとは別に持つ。
//
// `<details onToggle>` は開閉のたびに発火するので、開いたとき（`event.currentTarget.open`）だけ拾う。

import { useState, type ToggleEvent } from "react"

import type { QuestionBrief } from "../../../../../../../shared/session-driver/question-brief.ts"
import {
  sortQuestionOptions,
  type Question,
  type QuestionAnswer,
} from "../../../../../../../shared/session-driver/question.ts"
import type { MainViewQuestion } from "../../../../../../../shared/session/main-view-shape.ts"
import {
  inquiryBriefOf,
  optionRows,
  type InquiryBrief,
  type InquiryOptionRow,
} from "../../../stores/inquiry-answer.ts"
import type { ShelvedSource } from "../../inquiry/inquiry.tsx"

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

export type QuestionRecordBriefModel = {
  readonly brief: InquiryBrief
  readonly options: readonly InquiryOptionRow[]
  readonly imageSource: ShelvedSource
  readonly opened: boolean
  readonly onToggle: (event: ToggleEvent<HTMLDetailsElement>) => void
}

/** 1問ぶんが画面に出す形。 */
export type QuestionRecordQuestionModel = {
  readonly key: string
  readonly header: string
  readonly text: string
  /** 複数選択の質問か（単一選択は `●`/`○`、複数選択は `■`/`□` の印を選ぶ材料）。 */
  readonly multiSelect: boolean
  readonly answers: readonly QuestionRecordAnswerRow[]
  /** `preview` を持つ選択肢が1つも無ければ空（折りたたみ自体を出さない）。 */
  readonly previews: readonly QuestionRecordPreviewRow[]
  readonly previewsOpened: boolean
  readonly onTogglePreviews: (event: ToggleEvent<HTMLDetailsElement>) => void
  readonly brief?: QuestionRecordBriefModel
}

export type QuestionRecordModel = {
  /** 質問の tool use id。preview の画像はこの id で棚を引く。 */
  readonly toolUseId: string
  readonly questions: readonly QuestionRecordQuestionModel[]
}

export function useQuestionRecord(props: QuestionRecordProps): QuestionRecordModel {
  const [openedIndexes, setOpenedIndexes] = useState<ReadonlySet<number>>(new Set())
  const [briefOpenedIndexes, setBriefOpenedIndexes] = useState<ReadonlySet<number>>(new Set())

  return {
    toolUseId: props.entry.toolUseId,
    questions: props.entry.questions.map((question, index) => {
      const answer = props.entry.answers[index] ?? []
      const brief = props.entry.briefs.find((candidate) => candidate.header === question.header)
      return {
        brief:
          brief === undefined
            ? undefined
            : briefModel({
                entry: props.entry,
                question,
                answer,
                brief,
                opened: briefOpenedIndexes.has(index),
                onToggle: (event) => {
                  if (event.currentTarget.open) {
                    setBriefOpenedIndexes((current) => new Set(current).add(index))
                  }
                },
              }),
        key: `${question.header}-${String(index)}`,
        header: question.header,
        text: question.text,
        multiSelect: question.multiSelect,
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

function briefModel(given: {
  readonly entry: MainViewQuestion
  readonly question: Question
  readonly answer: QuestionAnswer
  readonly brief: QuestionBrief
  readonly opened: boolean
  readonly onToggle: (event: ToggleEvent<HTMLDetailsElement>) => void
}): QuestionRecordBriefModel {
  return {
    brief: inquiryBriefOf(given.brief),
    options: optionRows(given.question, given.answer, given.brief.options),
    imageSource: {
      kind: "shelved",
      toolUseId: given.entry.toolUseId,
      sizes: given.entry.imageSizes,
      unshelved: given.entry.unshelvedImages,
    },
    opened: given.opened,
    onToggle: given.onToggle,
  }
}

/**
 * 1問ぶんの選択肢と答えの行。
 * 選択肢そのものは札と同じ並び（`sortQuestionOptions`）で並べ、選択肢に無い答え（自由入力）は末尾に足す。
 * 答えとの突き合わせはラベル文字列で行うので、並べ替えても選ばれた印は崩れない。
 */
function answerRows(
  question: Question,
  answer: QuestionAnswer,
): readonly QuestionRecordAnswerRow[] {
  const choiceRows = sortQuestionOptions(question.options).map((option) => ({
    key: option.label,
    label: option.label,
    chosen: answer.includes(option.label),
    isFreeText: false,
  }))
  const freeTextRows = answer
    .filter((value) => !question.options.some((option) => option.label === value))
    .map((text) => ({ key: text, label: text, chosen: true, isFreeText: true }))
  return [...choiceRows, ...freeTextRows]
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
