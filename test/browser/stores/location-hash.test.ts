import { describe, expect, it } from "bun:test"

import { formatHash, parseHash } from "../../../src/browser/stores/location-hash.ts"

const IN_USE = { kind: "in-use" } as const
const TODAY = { kind: "today" } as const

describe("parseHash", () => {
  it("画面は `?` の前、見ているターンは turn の値から読む", () => {
    expect(parseHash("")).toEqual({
      screen: "conversation",
      turn: "newest",
      pack: IN_USE,
      achievementDate: TODAY,
    })
    expect(parseHash("#")).toEqual({
      screen: "conversation",
      turn: "newest",
      pack: IN_USE,
      achievementDate: TODAY,
    })
    expect(parseHash("#?turn=3")).toEqual({
      screen: "conversation",
      turn: 3,
      pack: IN_USE,
      achievementDate: TODAY,
    })
    expect(parseHash("#character")).toEqual({
      screen: "character",
      turn: "newest",
      pack: IN_USE,
      achievementDate: TODAY,
    })
    expect(parseHash("#token-usage?turn=-1")).toEqual({
      screen: "token-usage",
      turn: -1,
      pack: IN_USE,
      achievementDate: TODAY,
    })
  })

  it("知らない画面は会話の画面、番号に読めない turn は今回に追従に落ちる", () => {
    expect(parseHash("#nowhere?turn=2")).toEqual({
      screen: "conversation",
      turn: 2,
      pack: IN_USE,
      achievementDate: TODAY,
    })
    expect(parseHash("#?turn=abc")).toEqual({
      screen: "conversation",
      turn: "newest",
      pack: IN_USE,
      achievementDate: TODAY,
    })
    expect(parseHash("#?turn=1.5")).toEqual({
      screen: "conversation",
      turn: "newest",
      pack: IN_USE,
      achievementDate: TODAY,
    })
    expect(parseHash("#?turn=")).toEqual({
      screen: "conversation",
      turn: "newest",
      pack: IN_USE,
      achievementDate: TODAY,
    })
  })

  // 選んでいるパックはキャラクター画面のときだけ読む（docs/screen-design.md 13.6）。
  it("キャラクター画面の pack は選んでいるパック、ほかの画面では読まない", () => {
    expect(parseHash("#character?pack=other&turn=2")).toEqual({
      screen: "character",
      turn: 2,
      pack: { kind: "named", name: "other" },
      achievementDate: TODAY,
    })
    expect(parseHash("#character?pack=")).toEqual({
      screen: "character",
      turn: "newest",
      pack: IN_USE,
      achievementDate: TODAY,
    })
  })

  // 見ている日は成果の画面のときだけ読む（docs/screen-design.md 13.10）。
  it("成果の画面の date は見ている日、ほかの画面では読まない", () => {
    expect(parseHash("#achievement?date=2026-09-20&turn=2")).toEqual({
      screen: "achievement",
      turn: 2,
      pack: IN_USE,
      achievementDate: { kind: "chosen", date: "2026-09-20" },
    })
    expect(parseHash("#achievement?date=")).toEqual({
      screen: "achievement",
      turn: "newest",
      pack: IN_USE,
      achievementDate: TODAY,
    })
    expect(parseHash("#character?date=2026-09-20")).toEqual({
      screen: "character",
      turn: "newest",
      pack: IN_USE,
      achievementDate: TODAY,
    })
  })
})

describe("formatHash", () => {
  it("今回に追従しているときは turn を書かず、会話の画面は `#` になる", () => {
    expect(
      formatHash({ screen: "conversation", turn: "newest", pack: IN_USE, achievementDate: TODAY }),
    ).toBe("#")
    expect(
      formatHash({ screen: "character", turn: "newest", pack: IN_USE, achievementDate: TODAY }),
    ).toBe("#character")
  })

  it("留めたターンは turn に書く", () => {
    expect(
      formatHash({ screen: "conversation", turn: 3, pack: IN_USE, achievementDate: TODAY }),
    ).toBe("#?turn=3")
    expect(formatHash({ screen: "character", turn: 3, pack: IN_USE, achievementDate: TODAY })).toBe(
      "#character?turn=3",
    )
  })

  // `#character/<名前>` にせず `pack` に持つのは、`turn` と同じく画面の上に乗る付随情報だから。
  it("選んでいるパックは pack に書き、キャラクター画面以外では落とす", () => {
    const named = { kind: "named", name: "new" } as const
    expect(formatHash({ screen: "character", turn: 3, pack: named, achievementDate: TODAY })).toBe(
      "#character?pack=new&turn=3",
    )
    expect(
      formatHash({ screen: "conversation", turn: "newest", pack: named, achievementDate: TODAY }),
    ).toBe("#")
  })

  // `#achievement/<日付>` にせず `date` に持つのは、`pack` と同じく画面の上に乗る付随情報だから。
  it("見ている日は date に書き、成果の画面以外では落とす", () => {
    const chosen = { kind: "chosen", date: "2026-09-20" } as const
    expect(
      formatHash({ screen: "achievement", turn: 3, pack: IN_USE, achievementDate: chosen }),
    ).toBe("#achievement?date=2026-09-20&turn=3")
    expect(
      formatHash({ screen: "conversation", turn: "newest", pack: IN_USE, achievementDate: chosen }),
    ).toBe("#")
  })

  it("書いたものを読むと元に戻る", () => {
    const routes = [
      { screen: "conversation", turn: "newest", pack: IN_USE, achievementDate: TODAY },
      { screen: "conversation", turn: -1, pack: IN_USE, achievementDate: TODAY },
      { screen: "character", turn: 7, pack: IN_USE, achievementDate: TODAY },
      {
        screen: "character",
        turn: "newest",
        pack: { kind: "named", name: "new" },
        achievementDate: TODAY,
      },
      { screen: "token-usage", turn: "newest", pack: IN_USE, achievementDate: TODAY },
      {
        screen: "achievement",
        turn: "newest",
        pack: IN_USE,
        achievementDate: { kind: "chosen", date: "2026-09-20" },
      },
    ] as const
    for (const route of routes) {
      expect(parseHash(formatHash(route))).toEqual(route)
    }
  })
})
