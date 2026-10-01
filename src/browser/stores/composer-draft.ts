// 入力欄の下書き。入力欄の外（迎える口など）からも末尾へ足せるよう、store に持つ。

import { create } from "zustand"

/** 打ちかけの文面と、その中のキャレットの位置。2つで1つの状態なので一緒に持つ。 */
export type Draft = {
  readonly text: string
  readonly caret: number
}

export type ComposerDraftState = {
  readonly draft: Draft
  readonly setDraft: (draft: Draft) => void
  /** 字がある下書きは上書きせず、改行1つを挟んで末尾に足す。キャレットは足した字の末尾へ置く。 */
  readonly appendToDraft: (text: string) => void
}

export const EMPTY_DRAFT: Draft = { text: "", caret: 0 }

export const useComposerDraft = create<ComposerDraftState>()((set) => ({
  draft: EMPTY_DRAFT,
  setDraft: (draft) => {
    set({ draft })
  },
  appendToDraft: (text) => {
    set((current) => {
      const joined = current.draft.text === "" ? text : `${current.draft.text}\n${text}`
      return { draft: { text: joined, caret: joined.length } }
    })
  },
}))
