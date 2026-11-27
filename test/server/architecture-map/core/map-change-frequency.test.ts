import { matchesGlob } from "node:path"

import { describe, expect, it } from "vitest"

import {
  changeFrequencyOf,
  changeWindowStartOf,
} from "../../../../src/server/architecture-map/core/map-change-frequency.ts"

const commits = [
  { date: "2026-11-20", paths: ["alpha/a.ts", "beta/b.ts"] },
  { date: "2026-11-25", paths: ["alpha/c.ts"] },
  { date: "2026-11-10", paths: ["gamma/g.ts"] },
]

describe("changeFrequencyOf", () => {
  it("複数の glob に当たる commit を1回だけ数え、最終の日は当たった commit の最大にする", () => {
    expect(changeFrequencyOf(["alpha/**", "beta/**"], commits, matchesGlob)).toEqual({
      commitCount: 2,
      lastChangedOn: "2026-11-25",
    })
  })

  it("当たらない commit は数えない", () => {
    expect(changeFrequencyOf(["gamma/**"], commits, matchesGlob)).toEqual({
      commitCount: 1,
      lastChangedOn: "2026-11-10",
    })
  })

  it("0件のときは最終の日の欄が無い", () => {
    expect(changeFrequencyOf(["delta/**"], commits, matchesGlob)).toEqual({ commitCount: 0 })
    expect(changeFrequencyOf([], commits, matchesGlob)).toEqual({ commitCount: 0 })
  })
})

describe("changeWindowStartOf", () => {
  it("now の 30 日前を返す", () => {
    expect(
      changeWindowStartOf(Temporal.Instant.from("2026-11-27T00:00:00Z").epochMilliseconds),
    ).toBe("2026-10-28T00:00:00Z")
  })
})
