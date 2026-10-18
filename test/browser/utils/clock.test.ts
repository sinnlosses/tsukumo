import { describe, expect, it } from "vitest"

import { clockDateTime, clockTime, zonedDateTime } from "../../../src/browser/utils/clock.ts"

// タイムゾーンは架空の固定値で渡す（OS のタイムゾーンに左右されないようにするため）。
const TIME_ZONE = "Asia/Tokyo"
const EPOCH_MILLISECONDS = Temporal.ZonedDateTime.from(
  `2026-09-23T09:05:30+09:00[${TIME_ZONE}]`,
).epochMilliseconds

describe("clockTime", () => {
  it("秒を切り捨てた HH:MM にする", () => {
    expect(clockTime(zonedDateTime(EPOCH_MILLISECONDS, TIME_ZONE))).toBe("09:05")
  })
})

describe("clockDateTime", () => {
  it("分単位に丸めた ISO 8601 の日時にし、タイムゾーン名は出さない", () => {
    expect(clockDateTime(zonedDateTime(EPOCH_MILLISECONDS, TIME_ZONE))).toBe(
      "2026-09-23T09:05+09:00",
    )
  })
})
