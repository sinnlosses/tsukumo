import { describe, expect, test } from "vitest"

import {
  formatReplaySummary,
  summarizeReplay,
  type ReplayRun,
} from "../../../scripts/shared/replay-summary.ts"

const pass: ReplayRun = { passed: true, tokens: 100, durationMs: 4000, denials: 1 }
const fail: ReplayRun = { passed: false, tokens: 300, durationMs: 8000, denials: 2 }

describe("summarizeReplay", () => {
  test("中央値は、奇数個なら真ん中・偶数個なら中央2つの平均・空なら0", () => {
    const tokensOf = (tokens: readonly number[]) =>
      summarizeReplay(tokens.map((count) => ({ ...pass, tokens: count }))).medianTokens

    expect(tokensOf([3, 1, 2])).toBe(2)
    expect(tokensOf([4, 1, 3, 2])).toBe(2.5)
    expect(tokensOf([])).toBe(0)
  })

  test("k 回とも通ったときだけ passAll", () => {
    expect(summarizeReplay([pass, pass]).passAll).toBe(true)
    expect(summarizeReplay([pass, fail]).passAll).toBe(false)
    expect(summarizeReplay([]).passAll).toBe(false)
  })

  test("トークンと時間は中央値、拒否は合計", () => {
    expect(summarizeReplay([pass, fail])).toEqual({
      passAll: false,
      runs: 2,
      passedRuns: 1,
      medianTokens: 200,
      medianDurationMs: 6000,
      totalDenials: 3,
    })
  })
})

describe("formatReplaySummary", () => {
  test("pass^k・トークン・時間・拒否を1行ずつ出す", () => {
    expect(formatReplaySummary("a-1", summarizeReplay([pass, fail]))).toEqual([
      "a-1 pass^2: 通らなかった（1/2）",
      "a-1 トークンの中央値: 200",
      "a-1 時間の中央値: 6秒",
      "a-1 拒否の回数: 3",
    ])
  })
})
