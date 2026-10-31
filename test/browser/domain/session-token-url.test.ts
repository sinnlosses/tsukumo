import { describe, expect, it } from "vitest"

import { sessionTokenUrl } from "../../../src/browser/domain/session-token-url.ts"

describe("sessionTokenUrl", () => {
  it("ページの URL にあるトークンを経路へ付ける", () => {
    expect(sessionTokenUrl("/repository-file", "http://127.0.0.1:7517/?t=fictional-token")).toBe(
      "/repository-file?t=fictional-token",
    )
  })

  it("トークンが無いときは空文字を付ける（握りつぶさない）", () => {
    expect(sessionTokenUrl("/repository-file", "http://127.0.0.1:7517/")).toBe(
      "/repository-file?t=",
    )
  })

  it("トークンを含め、値は URL エンコードされる", () => {
    const pageUrl = `http://127.0.0.1:7517/?t=${encodeURIComponent("space value/slash")}`

    expect(sessionTokenUrl("/prompt-image/id", pageUrl)).toBe(
      "/prompt-image/id?t=space+value%2Fslash",
    )
  })
})
