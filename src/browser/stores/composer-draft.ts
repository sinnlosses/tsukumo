// 入力欄の下書き。入力欄の外（始め方の一覧など）からも末尾へ足せるよう、store に持つ。

import { create } from "zustand"

/** 打ちかけの文面と、その中のキャレットの位置。2つで1つの状態なので一緒に持つ。 */
export type Draft = {
  readonly text: string
  readonly caret: number
}

type ComposerDraftState = {
  readonly draft: Draft
  readonly setDraft: (draft: Draft) => void
  /** 字がある下書きは上書きせず、改行1つを挟んで末尾に足す。キャレットは足した字の末尾へ置く。 */
  readonly appendToDraft: (text: string) => void
  /** 引用を空行1つ挟んで下書きの頭に入れ、今の下書きはその後ろに残す。キャレットは下書き全体の末尾へ置く。 */
  readonly prependToDraft: (quote: string) => void
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
  prependToDraft: (quote) => {
    set((current) => {
      const joined = `${quote}\n\n${current.draft.text}`
      return { draft: { text: joined, caret: joined.length } }
    })
  },
}))
