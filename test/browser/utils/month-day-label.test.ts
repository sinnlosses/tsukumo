import { describe, expect, it } from "bun:test"

import { monthDayLabel } from "../../../src/browser/utils/month-day-label.ts"

describe("monthDayLabel", () => {
  it("「9月23日」の形で、年と曜日は付けない", () => {
    expect(monthDayLabel(Temporal.PlainDate.from("2026-09-23"))).toBe("9月23日")
  })

  it("1桁の月日はそのままの桁数で出す", () => {
    expect(monthDayLabel(Temporal.PlainDate.from("2026-01-05"))).toBe("1月5日")
  })
})
