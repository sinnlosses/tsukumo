import { describe, expect, it } from "vitest"

import { formatMinutesSeconds } from "../../../src/shared/utils/elapsed-time.ts"

describe("formatMinutesSeconds", () => {
  it.each([
    [0, "0:00"],
    [59, "0:59"],
    [60, "1:00"],
    [3725, "62:05"],
  ])("%i 秒は %s", (seconds, expected) => {
    expect(formatMinutesSeconds(seconds)).toBe(expected)
  })
})
