import { describe, expect, it } from "vitest"

import {
  formatMinutesSeconds,
  type MeasuredTime,
  totalOf,
} from "../../../src/shared/utils/elapsed-time.ts"

const known = (milliseconds: number): MeasuredTime => ({ kind: "known", milliseconds })
const unknown: MeasuredTime = { kind: "unknown" }

describe("totalOf", () => {
  it.each([
    ["空の配列は unknown", [], unknown],
    ["全部 known なら和", [known(1000), known(2500)], known(3500)],
    ["1つでも unknown なら unknown", [known(1000), unknown], unknown],
  ] as const)("%s", (_label, durations, expected) => {
    expect(totalOf(durations)).toEqual(expected)
  })
})

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
