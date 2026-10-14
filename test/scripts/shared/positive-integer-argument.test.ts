import { describe, expect, test } from "vitest"

import { positiveIntegerArgument } from "../../../scripts/shared/positive-integer-argument.ts"

describe("positiveIntegerArgument", () => {
  test.each([
    ["1", 1],
    ["30", 30],
    ["1e1", 10],
  ])("%s は正の整数として読む", (raw, expected) => {
    expect(positiveIntegerArgument.parse(raw)).toBe(expected)
  })

  test.each(["", " ", "0", "-3", "1.5", "abc", "Infinity", "NaN"])("%j は読めない", (raw) => {
    expect(positiveIntegerArgument.safeParse(raw).success).toBe(false)
  })
})
