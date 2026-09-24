import { describe, expect, it } from "bun:test"

import { localDateEpochRange } from "../../../src/server/adapter/local-time.ts"

describe("localDateEpochRange", () => {
  it("始まりと終わり（次の日の始まり）がちょうど24時間離れている", () => {
    const range = localDateEpochRange("2026-09-23")

    expect(range.endEpochMilliseconds - range.startEpochMilliseconds).toBe(24 * 60 * 60 * 1000)
  })

  it("終わりは次の日の始まりと一致する", () => {
    const today = localDateEpochRange("2026-09-23")
    const tomorrow = localDateEpochRange("2026-09-24")

    expect(today.endEpochMilliseconds).toBe(tomorrow.startEpochMilliseconds)
  })
})
