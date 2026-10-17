import { describe, expect, it } from "vitest"

import { isSourceLink } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/source-link.ts"

describe("isSourceLink", () => {
  it("字が href のホスト名と同じなら真", () => {
    expect(isSourceLink("https://example.com/a/b?q=1", "example.com")).toBe(true)
  })

  it("href の www. を除いて比べる", () => {
    expect(isSourceLink("https://www.example.com/a", "example.com")).toBe(true)
  })

  it("字の www. も除いて比べる", () => {
    expect(isSourceLink("https://example.com/a", "www.example.com")).toBe(true)
  })

  it("大文字小文字を揃えて比べる", () => {
    expect(isSourceLink("https://example.com/a", "Example.COM")).toBe(true)
  })

  it("字がホスト名と違えば偽", () => {
    expect(isSourceLink("https://example.com/a", "詳しい解説")).toBe(false)
    expect(isSourceLink("https://docs.example.com/a", "example.com")).toBe(false)
  })

  it("URL でない href・http(s) でない href は偽", () => {
    expect(isSourceLink("src/foo.ts", "foo.ts")).toBe(false)
    expect(isSourceLink("#example.com", "example.com")).toBe(false)
    expect(isSourceLink("mailto:a@example.com", "example.com")).toBe(false)
  })
})
