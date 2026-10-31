import { describe, expect, it } from "vitest"

import { dateKeySchema, parseDateKey } from "../../../src/shared/diary/date-key.ts"

describe("parseDateKey", () => {
  it("実在する YYYY-MM-DD だけを通す", () => {
    expect(parseDateKey("2026-09-23")).toBe("2026-09-23")
    for (const value of ["2026-02-30", "2026/09/23", "../x", "2026-9-23", ""]) {
      expect(parseDateKey(value)).toBeUndefined()
    }
  })
})

describe("dateKeySchema", () => {
  it("配る応答の日付も、実在する YYYY-MM-DD だけを通す", () => {
    expect(dateKeySchema.safeParse("2026-09-23").success).toBe(true)
    expect(dateKeySchema.safeParse("2026-02-30").success).toBe(false)
    expect(dateKeySchema.safeParse("2026-9-23").success).toBe(false)
  })
})
