import { describe, expect, it } from "bun:test"

import { formatHash, parseHash } from "../../../src/browser/stores/location-hash.ts"

describe("parseHash", () => {
  it("画面は `?` の前、見ているターンは turn の値から読む", () => {
    expect(parseHash("")).toEqual({ screen: "conversation", turn: "newest" })
    expect(parseHash("#")).toEqual({ screen: "conversation", turn: "newest" })
    expect(parseHash("#?turn=3")).toEqual({ screen: "conversation", turn: 3 })
    expect(parseHash("#character")).toEqual({ screen: "character", turn: "newest" })
    expect(parseHash("#character/new?turn=0")).toEqual({ screen: "character-create", turn: 0 })
    expect(parseHash("#token-usage?turn=-1")).toEqual({ screen: "token-usage", turn: -1 })
  })

  it("知らない画面は会話の画面、番号に読めない turn は今回に追従に落ちる", () => {
    expect(parseHash("#nowhere?turn=2")).toEqual({ screen: "conversation", turn: 2 })
    expect(parseHash("#?turn=abc")).toEqual({ screen: "conversation", turn: "newest" })
    expect(parseHash("#?turn=1.5")).toEqual({ screen: "conversation", turn: "newest" })
    expect(parseHash("#?turn=")).toEqual({ screen: "conversation", turn: "newest" })
  })
})

describe("formatHash", () => {
  it("今回に追従しているときは turn を書かず、会話の画面は `#` になる", () => {
    expect(formatHash({ screen: "conversation", turn: "newest" })).toBe("#")
    expect(formatHash({ screen: "character", turn: "newest" })).toBe("#character")
  })

  it("留めたターンは turn に書く", () => {
    expect(formatHash({ screen: "conversation", turn: 3 })).toBe("#?turn=3")
    expect(formatHash({ screen: "character-create", turn: 3 })).toBe("#character/new?turn=3")
  })

  it("書いたものを読むと元に戻る", () => {
    const routes = [
      { screen: "conversation", turn: "newest" },
      { screen: "conversation", turn: -1 },
      { screen: "character", turn: 7 },
      { screen: "token-usage", turn: "newest" },
    ] as const
    for (const route of routes) {
      expect(parseHash(formatHash(route))).toEqual(route)
    }
  })
})
