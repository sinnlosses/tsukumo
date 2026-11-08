// 入力欄の下書き。入力欄の外（始め方の一覧など）からも末尾へ足せるよう、store に持つ。

import { create } from "zustand"

import { dropSelectionOnWritingStart } from "./inquiry-draft.ts"

/** 下書きのほかに、入力欄のロジックが面に触るのはこの4つだけ。 */
export type ComposerSurface = {
  readonly focus: () => void
  readonly blur: () => void
  /** いまの選択の位置。打たずにキャレットだけ動かしたぶんは下書きの `caret` に入っていないので、ここから読む。 */
  readonly caret: () => number
  /** 外からの書き換え。文面と選択を置き、`onChange` は通さない。 */
  readonly replace: (text: string, caret: number) => void
}

/** 打ちかけの文面と、その中のキャレットの位置。2つで1つの状態なので一緒に持つ。 */
export type Draft = {
  readonly text: string
  readonly caret: number
}

type ComposerDraftState = {
  readonly draft: Draft
  /** 命令の届け先の入力欄。入力欄が描かれていないあいだは無い。 */
  readonly surface?: ComposerSurface
  /** 届け先の入力欄を登録する。返す関数は、いま登録されているのが自分のときだけ外す。 */
  readonly attachSurface: (surface: ComposerSurface) => () => void
  /** 入力欄で打った結果を写す。store だけを書く口で、面へは命令しない。 */
  readonly typeDraft: (draft: Draft) => void
  /** 入力欄の外から下書きを書き換える。store を書き、入力欄があれば `replace` で命令する。 */
  readonly replaceDraft: (draft: Draft) => void
  /** 字がある下書きは上書きせず、改行1つを挟んで末尾に足す。キャレットは足した字の末尾へ置く。 */
  readonly appendToDraft: (text: string) => void
  /** 字がある下書きは上書きせず、空行1つを挟んで末尾に足し、入力欄へフォーカスを送る。キャレットは足した字の末尾へ置く。 */
  readonly appendParagraphToDraft: (text: string) => void
  /** 引用を空行1つ挟んで下書きの頭に入れ、今の下書きはその後ろに残す。キャレットは下書き全体の末尾へ置く。 */
  readonly prependToDraft: (quote: string) => void
}

export const EMPTY_DRAFT: Draft = { text: "", caret: 0 }

export const useComposerDraft = create<ComposerDraftState>()((set, get) => {
  /** 下書きを差し替える。空から字ありへ変わるときだけ、答え待ちの質問の選択を外す（打鍵・引用・再試のどれもここを通る）。 */
  const commit = (next: Draft): void => {
    const startsWriting = get().draft.text === "" && next.text !== ""
    set({ draft: next })
    if (startsWriting) {
      dropSelectionOnWritingStart()
    }
  }
  const replaceDraft = (next: Draft): void => {
    commit(next)
    get().surface?.replace(next.text, next.caret)
  }
  return {
    draft: EMPTY_DRAFT,
    surface: undefined,
    attachSurface: (surface) => {
      set({ surface })
      return () => {
        if (get().surface === surface) {
          set({ surface: undefined })
        }
      }
    },
    typeDraft: commit,
    replaceDraft,
    appendToDraft: (text) => {
      const current = get().draft.text
      const joined = current === "" ? text : `${current}\n${text}`
      replaceDraft({ text: joined, caret: joined.length })
    },
    appendParagraphToDraft: (text) => {
      const current = get().draft.text
      const joined = current === "" ? text : `${current}\n\n${text}`
      replaceDraft({ text: joined, caret: joined.length })
      get().surface?.focus()
    },
    prependToDraft: (quote) => {
      const joined = `${quote}\n\n${get().draft.text}`
      replaceDraft({ text: joined, caret: joined.length })
    },
  }
})
