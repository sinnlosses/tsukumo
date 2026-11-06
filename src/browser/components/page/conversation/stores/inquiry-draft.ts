// お伺いに対して組み立て中の答えと、詳細のサーフェスに出すと触って決めた選択肢を持つ store。
// どちらもどの答え待ち（`PendingAsk.id`）に対するものかを一緒に持ち、別の答え待ちに替われば読む側が読まない。

import { create } from "zustand"

import { useSession } from "../../../../stores/session.ts"

/**
 * 組み立て中の答え。問ごとに持ち続ける（「戻る」で前の問に戻ったとき、選んだものが残っているように）。
 * `selections[i]` / `writtenAnswers[i]` は `questions[i]` に対応し、まだ触っていない問の位置は空のまま（読む側が `?? []` / `?? ""` で受ける）。
 */
export type DraftAnswer = {
  readonly index: number
  readonly selections: readonly (readonly string[])[]
  readonly writtenAnswers: readonly string[]
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
  const stored = useInquiryDraft.getState().draft
  if (pending?.kind !== "question" || stored?.pendingId !== pending.id) {
    return
  }
  const index = Math.min(stored.answer.index, pending.questions.length - 1)
  if (
    pending.questions[index]?.multiSelect !== false ||
    (stored.answer.selections[index] ?? []).length === 0
  ) {
    return
  }
  const selections = stored.answer.selections.map((chosen, i) => (i === index ? [] : chosen))
  useInquiryDraft.setState({
    draft: { pendingId: pending.id, answer: { ...stored.answer, selections } },
  })
}
