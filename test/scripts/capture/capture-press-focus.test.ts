// `--press` のキーがメインビューの外へ届くときの知らせを見る。

import { describe, expect, test } from "vitest"

import { pressFocusNotice } from "../../../scripts/capture/lib/capture-page.ts"

describe("pressFocusNotice", () => {
  test("フォーカスが body にあるときは、在りかと --click を先に置く手を知らせる", () => {
    const notice = pressFocusNotice({ description: "body", inMainView: false, inDialog: false })
    expect(notice).toContain("body")
    expect(notice).toContain("--click")
  })

  test("メインビューの中にあるときは知らせない", () => {
    expect(pressFocusNotice({ description: "div", inMainView: true, inDialog: false })).toBe("")
  })

  test("モーダルの中にあるときは知らせない", () => {
    expect(pressFocusNotice({ description: "button", inMainView: false, inDialog: true })).toBe("")
  })
})
