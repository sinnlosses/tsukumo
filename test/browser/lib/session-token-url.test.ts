import { describe, expect, it } from "bun:test"

import { sessionTokenUrl } from "../../../src/browser/lib/session-token-url.ts"
import { setPageUrl } from "../../dom-environment.ts"

// `window.location.href` を境界として持つので、`setPageUrl`（happy-dom の URL 差し替え口。
// test/dom-environment.ts）でページの URL を変えてから確かめる。

describe("sessionTokenUrl", () => {
  it("ページの URL にあるトークンを経路へ付ける", () => {
    setPageUrl("http://127.0.0.1:7517/?t=fictional-token")

    expect(sessionTokenUrl("/repository-file")).toBe("/repository-file?t=fictional-token")
  })

  it("トークンが無いときは空文字を付ける（握りつぶさない）", () => {
    setPageUrl("http://127.0.0.1:7517/")

    expect(sessionTokenUrl("/repository-file")).toBe("/repository-file?t=")
  })

  it("追加のクエリがあれば、トークンのあとに続ける", () => {
    setPageUrl("http://127.0.0.1:7517/?t=fictional-token")

    expect(sessionTokenUrl("/token-usage", { days: "30" })).toBe(
      "/token-usage?t=fictional-token&days=30",
    )
  })

  it("トークンを含め、値は URL エンコードされる", () => {
    setPageUrl(`http://127.0.0.1:7517/?t=${encodeURIComponent("space value/slash")}`)

    expect(sessionTokenUrl("/prompt-image/id")).toBe("/prompt-image/id?t=space+value%2Fslash")
  })
})
