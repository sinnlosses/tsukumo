import { afterEach, describe, expect, it } from "vitest"

import type { ComposerSurface } from "../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import { useComposerDraft } from "../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"

afterEach(() => {
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

describe("入力欄の下書きへ足す", () => {
  it("空の下書きには字だけが入り、キャレットは末尾に置かれる", () => {
    useComposerDraft.getState().appendToDraft("架空の依頼")
    expect(useComposerDraft.getState().draft).toEqual({ text: "架空の依頼", caret: 5 })
  })

  it("字がある下書きは上書きせず、改行を挟んで末尾に足す", () => {
    useComposerDraft.getState().replaceDraft({ text: "打ちかけ", caret: 2 })
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
    useComposerDraft.getState().replaceDraft({ text: "打ちかけ", caret: 2 })
    useComposerDraft.getState().prependToDraft("> 引く字")
    expect(useComposerDraft.getState().draft).toEqual({
      text: "> 引く字\n\n打ちかけ",
      caret: 11,
    })
  })
})

describe("入力欄への書き換えの命令", () => {
  function surfaceThatRecords(): {
    readonly surface: ComposerSurface
    readonly replaced: string[]
  } {
    const replaced: string[] = []
    const surface: ComposerSurface = {
      focus: () => {},
      blur: () => {},
      caret: () => 0,
      replace: (text, caret) => {
        replaced.push(`${text}@${caret}`)
      },
    }
    return { surface, replaced }
  }

  it("入力欄が登録されていれば、replaceDraft は store を書き、replace を命令する", () => {
    const { surface, replaced } = surfaceThatRecords()
    useComposerDraft.getState().attachSurface(surface)
    useComposerDraft.getState().replaceDraft({ text: "架空", caret: 1 })
    expect(useComposerDraft.getState().draft).toEqual({ text: "架空", caret: 1 })
    expect(replaced).toEqual(["架空@1"])
  })

  it("入力欄が無ければ store だけを書く", () => {
    expect(() => {
      useComposerDraft.getState().replaceDraft({ text: "架空", caret: 1 })
    }).not.toThrow()
    expect(useComposerDraft.getState().draft).toEqual({ text: "架空", caret: 1 })
  })

  it("typeDraft は replace を命令しない", () => {
    const { surface, replaced } = surfaceThatRecords()
    useComposerDraft.getState().attachSurface(surface)
    useComposerDraft.getState().typeDraft({ text: "打鍵", caret: 2 })
    expect(replaced).toEqual([])
  })

  it("外す関数は、いま登録されているのが自分のときだけ外す", () => {
    const first = surfaceThatRecords()
    const second = surfaceThatRecords()
    const detachFirst = useComposerDraft.getState().attachSurface(first.surface)
    useComposerDraft.getState().attachSurface(second.surface)
    detachFirst()
    useComposerDraft.getState().replaceDraft({ text: "架空", caret: 0 })
    expect(second.replaced).toEqual(["架空@0"])
  })
})
