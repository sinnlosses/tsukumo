// `--scroll-to` が複数の要素に当たったときの知らせを見る。

import { describe, expect, test } from "vitest"

import { scrollMatchNotice } from "../../../scripts/capture/lib/capture-page.ts"

describe("scrollMatchNotice", () => {
  test("1個に当たったときは知らせない", () => {
    expect(scrollMatchNotice("h4", 1)).toBe("")
  })

  test("2個以上に当たったときは個数と、先頭へ転がしたことを知らせる", () => {
    const notice = scrollMatchNotice("h4, h5", 3)
    expect(notice).toContain("一致 3 個")
    expect(notice).toContain("先頭へ転がした")
    expect(notice).toContain("h4, h5")
  })
})
