import { afterEach, describe, expect, it } from "vitest"

import { useComposerDraft } from "../../../src/browser/stores/composer-draft.ts"

afterEach(() => {
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

describe("入力欄の下書きへ足す", () => {
  it("空の下書きには字だけが入り、キャレットは末尾に置かれる", () => {
    useComposerDraft.getState().appendToDraft("架空の依頼")
    expect(useComposerDraft.getState().draft).toEqual({ text: "架空の依頼", caret: 5 })
  })

  it("字がある下書きは上書きせず、改行を挟んで末尾に足す", () => {
    useComposerDraft.getState().setDraft({ text: "打ちかけ", caret: 2 })
    useComposerDraft.getState().appendToDraft("足す字")
    expect(useComposerDraft.getState().draft).toEqual({ text: "打ちかけ\n足す字", caret: 8 })
  })
})

describe("入力欄の下書きの頭へ引用を入れる", () => {
  it("空の下書きには引用と空行が入り、キャレットは末尾に置かれる", () => {
    useComposerDraft.getState().prependToDraft("> 引く字")
    expect(useComposerDraft.getState().draft).toEqual({ text: "> 引く字\n\n", caret: 7 })
  })

  it("字がある下書きは引用と空行の後ろに残り、キャレットはその末尾に置かれる", () => {
    useComposerDraft.getState().setDraft({ text: "打ちかけ", caret: 2 })
    useComposerDraft.getState().prependToDraft("> 引く字")
    expect(useComposerDraft.getState().draft).toEqual({
      text: "> 引く字\n\n打ちかけ",
      caret: 11,
    })
  })
})
