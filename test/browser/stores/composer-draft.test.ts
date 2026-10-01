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
