import { describe, expect, it } from "vitest"

import { escapeHtml } from "../../../src/shared/utils/escape-html.ts"

describe("escapeHtml", () => {
  it("5つのメタ文字を実体参照にする", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    )
  })

  it("メタ文字のない文字列はそのまま", () => {
    expect(escapeHtml("あいう abc")).toBe("あいう abc")
  })
})
