import { describe, expect, it } from "vitest"

import { localDateEpochRange } from "../../../src/server/adapter/local-time.ts"

describe("localDateEpochRange", () => {
  it("終わりは次の日の始まりと一致する", () => {
    const today = localDateEpochRange("2026-09-23")
    const tomorrow = localDateEpochRange("2026-09-24")

    expect(today.endEpochMilliseconds).toBe(tomorrow.startEpochMilliseconds)
  })
})
