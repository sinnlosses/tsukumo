import { describe, expect, test } from "vitest"

import { readClockInstant } from "../../../scripts/capture/lib/capture-clock.ts"

describe("readClockInstant", () => {
  test("オフセット付きの ISO 時刻をエポックミリ秒に読む", () => {
    const expected = Temporal.Instant.from("2026-01-15T03:00:00Z").epochMilliseconds
    expect(readClockInstant("2026-01-15T03:00:00Z")).toBe(expected)
    expect(readClockInstant("2026-01-15T12:00:00+09:00")).toBe(expected)
  })

  test("読めない時刻とオフセットの無い時刻は読まない", () => {
    for (const bad of ["abc", "", "2026-01-15T12:00:00"]) {
      expect(readClockInstant(bad)).toBeUndefined()
    }
  })
})
