import { describe, expect, it } from "bun:test"

import { formatHash, parseHash } from "../../../src/browser/stores/location-hash.ts"

const IN_USE = { kind: "in-use" } as const

describe("parseHash", () => {
  it("画面は `?` の前、見ているターンは turn の値から読む", () => {
    expect(parseHash("")).toEqual({ screen: "conversation", turn: "newest", pack: IN_USE })
    expect(parseHash("#")).toEqual({ screen: "conversation", turn: "newest", pack: IN_USE })
    expect(parseHash("#?turn=3")).toEqual({ screen: "conversation", turn: 3, pack: IN_USE })
    expect(parseHash("#character")).toEqual({ screen: "character", turn: "newest", pack: IN_USE })
    expect(parseHash("#token-usage?turn=-1")).toEqual({
      screen: "token-usage",
      turn: -1,
      pack: IN_USE,
    })
  })

  it("知らない画面は会話の画面、番号に読めない turn は今回に追従に落ちる", () => {
    expect(parseHash("#nowhere?turn=2")).toEqual({ screen: "conversation", turn: 2, pack: IN_USE })
    expect(parseHash("#?turn=abc")).toEqual({
      screen: "conversation",
      turn: "newest",
      pack: IN_USE,
    })
    expect(parseHash("#?turn=1.5")).toEqual({
      screen: "conversation",
      turn: "newest",
      pack: IN_USE,
    })
    expect(parseHash("#?turn=")).toEqual({ screen: "conversation", turn: "newest", pack: IN_USE })
  })

  // 選んでいるパックはキャラクター画面のときだけ読む（docs/screen-design.md 13.6）。
  it("キャラクター画面の pack は選んでいるパック、ほかの画面では読まない", () => {
    expect(parseHash("#character?pack=other&turn=2")).toEqual({
      screen: "character",
      turn: 2,
      pack: { kind: "named", name: "other" },
    })
    expect(parseHash("#character?pack=")).toEqual({
      screen: "character",
      turn: "newest",
      pack: IN_USE,
    })
  })
})

describe("formatHash", () => {
  it("今回に追従しているときは turn を書かず、会話の画面は `#` になる", () => {
    expect(formatHash({ screen: "conversation", turn: "newest", pack: IN_USE })).toBe("#")
    expect(formatHash({ screen: "character", turn: "newest", pack: IN_USE })).toBe("#character")
  })

  it("留めたターンは turn に書く", () => {
    expect(formatHash({ screen: "conversation", turn: 3, pack: IN_USE })).toBe("#?turn=3")
    expect(formatHash({ screen: "character", turn: 3, pack: IN_USE })).toBe("#character?turn=3")
  })

  // `#character/<名前>` にせず `pack` に持つのは、`turn` と同じく画面の上に乗る付随情報だから。
  it("選んでいるパックは pack に書き、キャラクター画面以外では落とす", () => {
    const named = { kind: "named", name: "new" } as const
    expect(formatHash({ screen: "character", turn: 3, pack: named })).toBe(
      "#character?pack=new&turn=3",
    )
    expect(formatHash({ screen: "conversation", turn: "newest", pack: named })).toBe("#")
  })

  it("書いたものを読むと元に戻る", () => {
    const routes = [
      { screen: "conversation", turn: "newest", pack: IN_USE },
      { screen: "conversation", turn: -1, pack: IN_USE },
      { screen: "character", turn: 7, pack: IN_USE },
      { screen: "character", turn: "newest", pack: { kind: "named", name: "new" } },
      { screen: "token-usage", turn: "newest", pack: IN_USE },
    ] as const
    for (const route of routes) {
      expect(parseHash(formatHash(route))).toEqual(route)
    }
  })
})
