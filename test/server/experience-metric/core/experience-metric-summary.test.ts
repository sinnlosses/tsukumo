import { describe, expect, it } from "vitest"

import { summarizeExperienceMetric } from "../../../../src/server/experience-metric/core/experience-metric-summary.ts"
import type {
  ConclusionEntry,
  RecoveryEntry,
} from "../../../../src/server/experience-metric/core/experience-metric.ts"

function conclusion(
  at: number,
  untilConclusionMs: number,
  overrides: Partial<Pick<ConclusionEntry, "moment" | "askingMs" | "askCount">> = {},
): ConclusionEntry {
  return {
    at,
    sessionId: "claude-session-1",
    kind: "conclusion",
    moment: "deliver",
    untilConclusionMs,
    askingMs: 0,
    askCount: 0,
    ...overrides,
  }
}

function recovery(at: number, hands: number, untilRecoveryMs: number): RecoveryEntry {
  return { at, sessionId: "claude-session-1", kind: "recovery", hands, untilRecoveryMs }
}

describe("summarizeExperienceMetric", () => {
  it("中央値と90パーセンタイルは、補間せずに最も近い順位の値を取る", () => {
    const entries = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((seconds, index) =>
      conclusion(index, seconds * 1000),
    )

    const [summary] = summarizeExperienceMetric(entries, { kind: "whole" })

    expect(summary?.untilConclusionMs).toEqual({ kind: "measured", median: 50_000, p90: 90_000 })
  })

  it("閉じた局面ごとの件数・答え待ちのあった依頼・立ち直りを数える", () => {
    const entries = [
      conclusion(1, 30_000),
      conclusion(2, 40_000, { moment: "stumble" }),
      conclusion(3, 60_000, { askingMs: 12_000, askCount: 1 }),
      conclusion(4, 90_000, { askingMs: 4_000, askCount: 2 }),
      recovery(5, 2, 120_000),
    ]

    const [summary] = summarizeExperienceMetric(entries, { kind: "whole" })

    expect(summary).toEqual({
      range: "whole",
      delivered: 3,
      stumbled: 1,
      untilConclusionMs: { kind: "measured", median: 40_000, p90: 90_000 },
      asked: 2,
      askingMs: { kind: "measured", median: 4_000, p90: 12_000 },
      askingTotalMs: 16_000,
      recoveries: 1,
      hands: { kind: "measured", median: 2, p90: 2 },
      untilRecoveryMs: { kind: "measured", median: 120_000, p90: 120_000 },
    })
  })

  it("境目の前後に分け、境目ちょうどは後ろに入れる", () => {
    const entries = [conclusion(100, 10_000), conclusion(200, 20_000), conclusion(300, 30_000)]

    const summaries = summarizeExperienceMetric(entries, { kind: "around", boundary: 200 })

    expect(summaries.map((summary) => [summary.range, summary.delivered])).toEqual([
      ["before", 1],
      ["after", 2],
    ])
  })

  it("1件も無い塊は empty になる", () => {
    const [summary] = summarizeExperienceMetric([], { kind: "whole" })

    expect(summary?.untilConclusionMs).toEqual({ kind: "empty" })
    expect(summary?.hands).toEqual({ kind: "empty" })
  })
})
