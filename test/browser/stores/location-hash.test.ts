import { afterEach, describe, expect, it } from "vitest"

import {
  formatHash,
  readHashRoute,
  type HashRoute,
} from "../../../src/browser/stores/location-hash.ts"

const IN_USE = { kind: "in-use" } as const
const TODAY = { kind: "today" } as const

afterEach(() => {
  window.location.hash = ""
})

function readHash(hash: string): HashRoute {
  window.location.hash = hash
  return readHashRoute()
}

/** 確かめたい欄だけを渡す（残りは「何も選んでいない」の値）。 */
function route(overrides: Partial<HashRoute>): HashRoute {
  return {
    screen: "conversation",
    turn: "newest",
    pack: IN_USE,
    achievementDate: TODAY,
    lastReview: false,
    ...overrides,
  }
}

describe("readHashRoute", () => {
  it("画面は `?` の前、見ているターンは turn の値から読む", () => {
    expect(readHash("")).toEqual(route({}))
    expect(readHash("#")).toEqual(route({}))
    expect(readHash("#?turn=3")).toEqual(route({ turn: 3 }))
    expect(readHash("#character")).toEqual(route({ screen: "character" }))
    expect(readHash("#token-usage?turn=-1")).toEqual(route({ screen: "token-usage", turn: -1 }))
  })

  it("知らない画面は会話の画面、番号に読めない turn は今回に追従に落ちる", () => {
    expect(readHash("#nowhere?turn=2")).toEqual(route({ turn: 2 }))
    expect(readHash("#?turn=abc")).toEqual(route({}))
    expect(readHash("#?turn=1.5")).toEqual(route({}))
    expect(readHash("#?turn=")).toEqual(route({}))
  })

  // 選んでいるパックはキャラクター画面のときだけ読む（docs/architecture/screen-design.md「設定の置き場所」）。
  it("キャラクター画面の pack は選んでいるパック、ほかの画面では読まない", () => {
    expect(readHash("#character?pack=other&turn=2")).toEqual(
      route({ screen: "character", turn: 2, pack: { kind: "named", name: "other" } }),
    )
    expect(readHash("#character?pack=")).toEqual(route({ screen: "character" }))
  })

  // 見ている日は成果の画面のときだけ読む（docs/architecture/screen-design.md「成果の画面」）。
  it("成果の画面の date は見ている日、ほかの画面では読まない", () => {
    expect(readHash("#achievement?date=2026-09-20&turn=2")).toEqual(
      route({
        screen: "achievement",
        turn: 2,
        achievementDate: { kind: "chosen", date: "2026-09-20" },
      }),
    )
    expect(readHash("#achievement?date=")).toEqual(route({ screen: "achievement" }))
    expect(readHash("#character?date=2026-09-20")).toEqual(route({ screen: "character" }))
  })

  it("トークン画面の review=last は結果の札を開く印、ほかの画面では読まない", () => {
    expect(readHash("#token-usage?review=last")).toEqual(
      route({ screen: "token-usage", lastReview: true }),
    )
    expect(readHash("#token-usage?review=other")).toEqual(route({ screen: "token-usage" }))
    expect(readHash("#character?review=last")).toEqual(route({ screen: "character" }))
  })
})

describe("formatHash", () => {
  it("今回に追従しているときは turn を書かず、会話の画面は `#` になる", () => {
    expect(formatHash(route({}))).toBe("#")
    expect(formatHash(route({ screen: "character" }))).toBe("#character")
  })

  it("留めたターンは turn に書く", () => {
    expect(formatHash(route({ turn: 3 }))).toBe("#?turn=3")
    expect(formatHash(route({ screen: "character", turn: 3 }))).toBe("#character?turn=3")
  })

  // `#character/<名前>` にせず `pack` に持つのは、`turn` と同じく画面の上に乗る付随情報だから。
  it("選んでいるパックは pack に書き、キャラクター画面以外では落とす", () => {
    const named = { kind: "named", name: "new" } as const
    expect(formatHash(route({ screen: "character", turn: 3, pack: named }))).toBe(
      "#character?pack=new&turn=3",
    )
    expect(formatHash(route({ pack: named }))).toBe("#")
  })

  // `#achievement/<日付>` にせず `date` に持つのは、`pack` と同じく画面の上に乗る付随情報だから。
  it("見ている日は date に書き、成果の画面以外では落とす", () => {
    const chosen = { kind: "chosen", date: "2026-09-20" } as const
    expect(formatHash(route({ screen: "achievement", turn: 3, achievementDate: chosen }))).toBe(
      "#achievement?date=2026-09-20&turn=3",
    )
    expect(formatHash(route({ achievementDate: chosen }))).toBe("#")
  })

  it("結果の札を開く印は review=last に書き、トークン画面以外では落とす", () => {
    expect(formatHash(route({ screen: "token-usage", lastReview: true }))).toBe(
      "#token-usage?review=last",
    )
    expect(formatHash(route({ lastReview: true }))).toBe("#")
  })
})
