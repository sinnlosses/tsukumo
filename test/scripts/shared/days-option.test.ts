import { describe, expect, test } from "vitest"

import { parseDaysOption } from "../../../scripts/shared/days-option.ts"

describe("parseDaysOption", () => {
  test("--days が無ければ既定の28日", () => {
    expect(parseDaysOption([])).toBe(28)
  })

  test("--days <n> の正の整数を読む", () => {
    expect(parseDaysOption(["--days", "14"])).toBe(14)
  })

  test.each([["--foo"], ["--days", "0"], ["--days", "-1"], ["--days", "abc"], ["--days"]])(
    "%j は崩れた引数として invalid に畳む",
    (...args) => {
      expect(parseDaysOption(args)).toBe("invalid")
    },
  )
})
