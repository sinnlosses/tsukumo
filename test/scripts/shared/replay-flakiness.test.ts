import { describe, expect, test } from "vitest"

import {
  compareReplayVersions,
  formatReplayComparison,
  parseReplayResult,
  type ReplayResult,
} from "../../../scripts/shared/replay-flakiness.ts"
import { summarizeReplay } from "../../../scripts/shared/replay-summary.ts"

const run = (passed: boolean) => ({ passed, tokens: 100, durationMs: 1000, denials: 0 })

/** 件ごとの通った回数（k=2）から1回ぶんの結果を作る。 */
function resultOf(passedById: Readonly<Record<string, number>>): ReplayResult {
  return {
    cases: Object.entries(passedById).map(([id, passed]) => ({
      id,
      summary: summarizeReplay([run(passed >= 1), run(passed >= 2)]),
    })),
  }
}

describe("compareReplayVersions", () => {
  test("同じ版の打ち直しで反転した件に印を付けて外し、残りで通った件を数える", () => {
    const baseline = [
      resultOf({ "a-1": 2, "a-2": 0, "a-3": 0, "a-4": 2 }),
      resultOf({ "a-1": 0, "a-2": 0, "a-3": 0, "a-4": 2 }),
    ]
    const candidate = [
      resultOf({ "a-1": 2, "a-2": 0, "a-3": 2, "a-4": 2 }),
      resultOf({ "a-1": 2, "a-2": 2, "a-3": 2, "a-4": 2 }),
    ]

    expect(formatReplayComparison(compareReplayVersions(baseline, candidate))).toEqual([
      "a-1 揺れ（元の版）: 2/2・0/2",
      "a-2 揺れ（候補の版）: 0/2・2/2",
      "揺れて外した件: a-1, a-2",
      "比べた件: 2",
      "通った件: 元の版 1・候補の版 2",
    ])
  })

  test("1回の --k の中で通りと落ちが混ざった件は、繰り返しが無くても揺れに数える", () => {
    const comparison = compareReplayVersions([resultOf({ "a-1": 1 })], [resultOf({ "a-1": 2 })])

    expect(comparison.excluded).toEqual(["a-1"])
    expect(comparison.flakes).toEqual([
      { id: "a-1", version: "baseline", counts: [{ passedRuns: 1, runs: 2 }] },
    ])
  })

  test("揺れの無い入力では印を付けず、片方の版にしかない件は比べない", () => {
    const comparison = compareReplayVersions(
      [resultOf({ "a-1": 2, "a-2": 0 }), resultOf({ "a-1": 2, "a-2": 0 })],
      [resultOf({ "a-1": 0, "a-2": 0, "a-3": 2 })],
    )

    expect(comparison).toEqual({
      flakes: [],
      excluded: [],
      compared: 2,
      baselinePassed: 1,
      candidatePassed: 0,
    })
  })
})

describe("parseReplayResult", () => {
  test("--out の形を読み、崩れた形は invalid に畳む", () => {
    const result = resultOf({ "a-1": 2 })

    expect(parseReplayResult(JSON.parse(JSON.stringify(result)))).toEqual(result)
    expect(parseReplayResult({ cases: [{ id: "a-1" }] })).toBe("invalid")
    expect(parseReplayResult([])).toBe("invalid")
  })
})
