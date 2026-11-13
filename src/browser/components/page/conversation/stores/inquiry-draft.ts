// お伺いに対して組み立て中の答えと、詳細のサーフェスに出すと触って決めた選択肢を持つ store。
// どちらもどの答え待ち（`PendingAsk.id`）に対するものかを一緒に持ち、別の答え待ちに替われば読む側が読まない。

import { create } from "zustand"

import {
  FREE_TEXT_OPTION_LABEL,
  isRecommendedLabel,
  sortQuestionOptions,
  type Question,
} from "../../../../../shared/session-driver/question.ts"
import { useSession } from "../../../../stores/session.ts"

/**
 * 組み立て中の答え。問ごとに持ち続ける（「戻る」で前の問に戻ったとき、選んだものが残っているように）。
 * `selections[i]` / `writtenAnswers[i]` / `entrusted[i]` は `questions[i]` に対応し、まだ触っていない問の位置は空のまま（読む側が `?? []` / `?? ""` / `?? false` で受ける）。
 * `entrusted[i]` は判断を任せて確定した問。選んだラベルと入力欄の字は残すが、答えには使わない。
 */
export type DraftAnswer = {
  readonly index: number
  readonly selections: readonly (readonly string[])[]
  readonly writtenAnswers: readonly string[]
  readonly entrusted: readonly boolean[]
}

type InquiryDraftState = {
  /** どの答え待ち（`PendingAsk.id`）に対して組み立てている答えか。まだ何も触っていなければ undefined。 */
  readonly draft?: { readonly pendingId: string; readonly answer: DraftAnswer }
}

export const useInquiryDraft = create<InquiryDraftState>()(() => ({ draft: undefined }))

/** 詳細のサーフェスに出すと触って決めた選択肢。どの答え待ちの何問目かも持ち、別の問に替われば読まない。 */
export type InquiryFocus =
  | { readonly kind: "none" }
  | {
      readonly kind: "touched"
      readonly pendingId: string
      readonly index: number
      readonly label: string
    }

type InquiryFocusState = {
  readonly focus: InquiryFocus
}

export const useInquiryFocus = create<InquiryFocusState>()(() => ({ focus: { kind: "none" } }))

/**
 * 入力欄が空から字ありに変わった瞬間に、見ている問（単一選択）の選択だけを外す。
 * 入力欄の下書きの store が、その変わり目に1度だけ呼ぶ（部品が付くことや答え待ちの作り直しでは呼ばれない）。
 */
export function dropSelectionOnWritingStart(): void {
  const pending = useSession.getState().state.pending[0]
  if (pending?.kind !== "question") {
    return
  }
  const stored = useInquiryDraft.getState().draft
  const answer = stored?.pendingId === pending.id ? stored.answer : EMPTY_DRAFT_ANSWER
  const index = Math.min(answer.index, pending.questions.length - 1)
  const question = pending.questions[index]
  if (question?.multiSelect !== false) {
    return
  }
  const current = answer.selections[index] ?? recommendedSelection(question)
  if (current.length === 0) {
    return
  }
  const length = Math.max(answer.selections.length, index + 1)
  const selections = Array.from({ length }, (_, i) =>
    i === index ? [] : (answer.selections[i] ?? []),
  )
  useInquiryDraft.setState({
    draft: { pendingId: pending.id, answer: { ...answer, selections } },
  })
}

export const EMPTY_DRAFT_ANSWER: DraftAnswer = {
  index: 0,
  selections: [],
  writtenAnswers: [],
  entrusted: [],
}

/**
 * まだ触っていない問の選択の初期値。おすすめの行を選んだ状態で開く。
 * 単一選択は並びの先頭のおすすめ1つ、複数選択はおすすめの行すべて。おすすめが無ければ空。
 */
export function recommendedSelection(question: Question): readonly string[] {
  const labels = sortQuestionOptions(question.options)
    .map((option) => option.label)
    .filter((label) => label !== FREE_TEXT_OPTION_LABEL && isRecommendedLabel(label))
  return question.multiSelect ? labels : labels.slice(0, 1)
}
