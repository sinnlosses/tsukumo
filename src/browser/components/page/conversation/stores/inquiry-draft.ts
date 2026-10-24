// お伺いに対して組み立て中の答えと、詳細の面に出すと触って決めた選択肢を持つ store。
// どちらもどの答え待ち（`PendingAsk.id`）に対するものかを一緒に持ち、別の答え待ちに替われば読む側が読まない。

import { create } from "zustand"

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
  readonly draft: { readonly pendingId: string; readonly answer: DraftAnswer } | undefined
}

export const useInquiryDraft = create<InquiryDraftState>()(() => ({ draft: undefined }))

/** 詳細の面に出すと触って決めた選択肢。どの答え待ちの何問目かも持ち、別の問に替われば読まない。 */
export type InquiryFocus = {
  readonly pendingId: string
  readonly index: number
  readonly label: string
}

type InquiryFocusState = {
  readonly focus: InquiryFocus | undefined
}

export const useInquiryFocus = create<InquiryFocusState>()(() => ({ focus: undefined }))
