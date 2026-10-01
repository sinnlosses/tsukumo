import { describe, expect, it } from "vitest"

import { linkedPaste } from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/markdown-editor-surface/domain/markdown-link-paste.ts"

describe("linkedPaste", () => {
  it("範囲を選んで URL を貼ると選んだ字のリンクにする", () => {
    expect(linkedPaste("文書", "https://example.test/a?b=1")).toEqual({
      kind: "link",
      text: "[文書](https://example.test/a?b=1)",
    })
    expect(linkedPaste("文書", " http://example.test\n")).toEqual({
      kind: "link",
      text: "[文書](http://example.test)",
    })
  })

  it("範囲が無いときはそのまま", () => {
    expect(linkedPaste("", "https://example.test")).toEqual({ kind: "plain" })
  })

  it("URL でないものはそのまま", () => {
    expect(linkedPaste("文書", "ftp://example.test")).toEqual({ kind: "plain" })
    expect(linkedPaste("文書", "https://example.test 続き")).toEqual({ kind: "plain" })
    expect(linkedPaste("文書", "example.test")).toEqual({ kind: "plain" })
  })
})
