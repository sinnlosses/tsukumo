import { markdownLanguage } from "@codemirror/lang-markdown"
import { ensureSyntaxTree } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { continueMarkupOnEnter } from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/markdown-editor-surface/domain/markdown-newline-continuation.ts"

describe("continueMarkupOnEnter", () => {
  it.each([
    ["- 一", "- 一\n- "],
    ["> 一", "> 一\n> "],
    ["- ", ""],
    ["- 一\n- 二\n- ", "- 一\n- 二\n"],
    ["> ", ""],
    ["> 一\n> ", "> 一\n"],
    ["> >", ""],
    ["  > ", "  "],
    ["```\n> ", "```\n> "],
    ["```\n> 一\n> ", "```\n> 一\n> "],
    ["> ```\n> ", "> ```\n> "],
    ["    > ", "    > "],
    ["あ", "あ"],
  ])(
    "末尾で Enter を押すと %j は %j になる（記号の無い行は上流が扱わず、既定の改行へ回る）",
    (before, after) => {
      expect(pressEnterAtEnd(before)).toBe(after)
    },
  )
})

function pressEnterAtEnd(text: string): string {
  let state = EditorState.create({
    doc: text,
    selection: { anchor: text.length },
    extensions: [markdownLanguage],
  })
  ensureSyntaxTree(state, state.doc.length, 5000)
  continueMarkupOnEnter({
    state,
    dispatch: (transaction) => {
      state = transaction.state
    },
  })
  return state.doc.toString()
}
