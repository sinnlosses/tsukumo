import { describe, expect, it } from "vitest"

import {
  localDateEpochRange,
  localDateKey,
  millisecondsUntilNextLocalDay,
  todayLocalDateKey,
} from "../../../src/server/adapter/local-time.ts"

describe("localDateEpochRange", () => {
  it("終わりは次の日の始まりと一致する", () => {
    const today = localDateEpochRange("2026-09-23")
    const tomorrow = localDateEpochRange("2026-09-24")

    expect(today.endEpochMilliseconds).toBe(tomorrow.startEpochMilliseconds)
  })
})

describe("凍らせた時計から導く今日", () => {
  const frozen = (): number => Temporal.Instant.from("2001-03-04T12:00:00Z").epochMilliseconds

  it("今日の日付は時計が指す日で、本物の今日ではない", () => {
    expect(todayLocalDateKey(frozen)).toBe(localDateKey(frozen()))
    expect(todayLocalDateKey(frozen).startsWith("2001-03-0")).toBe(true)
  })

  it("次の日の始まりまでは、時計が指す日の終わりから時計の値を引いた長さ", () => {
    expect(millisecondsUntilNextLocalDay(frozen)).toBe(
      localDateEpochRange(todayLocalDateKey(frozen)).endEpochMilliseconds - frozen(),
    )
  })
})
