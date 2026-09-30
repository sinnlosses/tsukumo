import { describe, expect, it } from "vitest"

import { summarizeTokenUsage } from "../../../../src/server/token-usage/core/token-usage-summary.ts"
import type { TokenUsageTrend } from "../../../../src/shared/token-usage/token-usage-summary.ts"
import {
  TOKEN_USAGE_FORMAT_VERSION,
  type ModelTokenUsage,
  type TokenUsageRecord,
  type ToolUsageCount,
} from "../../../../src/shared/token-usage/token-usage.ts"

function usage(model: string, input: number, output: number, cost: number): ModelTokenUsage {
  return {
    model,
    inputTokens: input,
    outputTokens: output,
    thinkingTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUsd: cost,
  }
}

// ここから下は summarizeTokenUsage 用のフィクスチャ。壊れた行・版違いの行を落とすのは
// adapter（別のテスト）の役目なので、ここには渡さない — summarizeTokenUsage は
// 既に検証済みの行だけを受け取る前提の純関数。
const EMPTY_STEP = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
}

function toolUsage(name: string, calls: number, resultBytes: number): ToolUsageCount {
  return { name, calls, resultBytes }
}

function record(
  at: string,
  models: readonly ModelTokenUsage[],
  mainTools: readonly ToolUsageCount[] = [],
  subagentTools: readonly ToolUsageCount[] = [],
): TokenUsageRecord {
  return {
    v: TOKEN_USAGE_FORMAT_VERSION,
    at,
    sessionId: "claude-session-1",
    mode: "work",
    models,
    breakdown: {
      main: { steps: 0, tokens: EMPTY_STEP, tools: mainTools },
      subagent: { steps: 0, tokens: EMPTY_STEP, tools: subagentTools },
    },
  }
}
/** 推移の点を全部足した数（期間の切り方を測るテストが、点の並びに寄りかからずに済む）。 */
function totalOfTrend(trend: TokenUsageTrend): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: trend.points.reduce((total, point) => total + point.totals.inputTokens, 0),
    outputTokens: trend.points.reduce((total, point) => total + point.totals.outputTokens, 0),
  }
}

describe("summarizeTokenUsage", () => {
  it("日またぎの境界: 期間の外の日の行は推移に含めない", () => {
    const records = [
      record("2026-09-21T23:59:00+09:00", [usage("opus", 100, 20, 0.5)]),
      record("2026-09-22T09:00:00+09:00", [usage("opus", 50, 10, 0.2)]),
      record("2026-09-23T00:00:00+09:00", [usage("opus", 5, 1, 0.01)]),
    ]

    const summary = summarizeTokenUsage(records, {
      startDate: "2026-09-22",
      endDate: "2026-09-22",
    })

    expect(totalOfTrend(summary.trend)).toEqual({ inputTokens: 50, outputTokens: 10 })
  })

  it("複数日にまたがる期間は、日ごとに分けて古い→新しい順に並べる", () => {
    const records = [
      record("2026-09-23T09:00:00+09:00", [usage("opus", 5, 1, 0.01)]),
      record("2026-09-21T09:00:00+09:00", [usage("opus", 100, 20, 0.5)]),
      record("2026-09-22T09:00:00+09:00", [usage("opus", 50, 10, 0.2)]),
    ]

    const summary = summarizeTokenUsage(records, {
      startDate: "2026-09-21",
      endDate: "2026-09-23",
    })

    expect(summary.trend.unit).toBe("day")
    expect(summary.trend.points.map((point) => point.key)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ])
    expect(summary.trend.points.map((point) => point.totals.inputTokens)).toEqual([100, 50, 5])
  })

  it("記録の無い日も0の点として期間のぶんだけ並ぶ（穴を空けない）", () => {
    const records = [record("2026-09-22T09:00:00+09:00", [usage("opus", 50, 10, 0.2)])]

    const summary = summarizeTokenUsage(records, {
      startDate: "2026-09-20",
      endDate: "2026-09-24",
    })

    expect(summary.trend.points.map((point) => point.key)).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ])
    expect(summary.trend.points.map((point) => point.totals.inputTokens)).toEqual([0, 0, 50, 0, 0])
  })

  it("1日だけの期間は時間ごと（0〜23時の24点）に割る", () => {
    const records = [
      record("2026-09-22T00:30:00+09:00", [usage("opus", 7, 1, 0.01)]),
      record("2026-09-22T09:00:00+09:00", [usage("opus", 50, 10, 0.2)]),
      record("2026-09-22T09:40:00+09:00", [usage("opus", 3, 1, 0.01)]),
      record("2026-09-22T23:59:00+09:00", [usage("opus", 9, 2, 0.02)]),
    ]

    const summary = summarizeTokenUsage(records, {
      startDate: "2026-09-22",
      endDate: "2026-09-22",
    })

    expect(summary.trend.unit).toBe("hour")
    expect(summary.trend.points).toHaveLength(24)
    expect(summary.trend.points.map((point) => point.key).slice(0, 3)).toEqual(["00", "01", "02"])
    expect(summary.trend.points.at(-1)?.key).toBe("23")
    // 同じ時の行は足し合わさり、記録の無い時は0のまま残る。
    expect(summary.trend.points.map((point) => point.totals.inputTokens)).toEqual([
      7, 0, 0, 0, 0, 0, 0, 0, 0, 53, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9,
    ])
  })

  it("時の読みはタイムゾーンを変換し直さない（オフセットが違っても書かれた時のまま）", () => {
    const records = [record("2026-09-22T09:00:00+00:00", [usage("opus", 50, 10, 0.2)])]

    const summary = summarizeTokenUsage(records, {
      startDate: "2026-09-22",
      endDate: "2026-09-22",
    })

    expect(summary.trend.points[9]?.totals.inputTokens).toBe(50)
  })

  it("記録が無い期間は、推移が0の点で埋まりモデル別とツール別は空になる", () => {
    const summary = summarizeTokenUsage([], { startDate: "2026-09-01", endDate: "2026-09-03" })

    expect(summary.byModel).toEqual([])
    expect(summary.byTool).toEqual([])
    expect(summary.trend.points.map((point) => point.totals.inputTokens)).toEqual([0, 0, 0])
  })

  it("同じ日・同じ期間の行が1件も無いときも空の並びを返す(記録はあるが期間の外)", () => {
    const records = [record("2026-08-01T09:00:00+09:00", [usage("opus", 100, 20, 0.5)])]

    const summary = summarizeTokenUsage(records, { startDate: "2026-09-01", endDate: "2026-09-30" })

    expect(summary.byModel).toEqual([])
    expect(summary.byTool).toEqual([])
    expect(totalOfTrend(summary.trend)).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it("モデルごとに数を足し合わせ、出力の多い順で並べる", () => {
    const records = [
      record("2026-09-22T09:00:00+09:00", [
        usage("opus", 100, 20, 0.5),
        usage("haiku", 10, 2, 0.01),
      ]),
      record("2026-09-22T10:00:00+09:00", [usage("opus", 50, 10, 0.2)]),
    ]

    const summary = summarizeTokenUsage(records, {
      startDate: "2026-09-22",
      endDate: "2026-09-22",
    })

    // opus は出力合計30、haiku は2。出力の多い opus が先に並ぶ。
    expect(summary.byModel).toEqual([
      {
        model: "opus",
        totals: {
          inputTokens: 150,
          outputTokens: 30,
          thinkingTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUsd: 0.7,
        },
      },
      {
        model: "haiku",
        totals: {
          inputTokens: 10,
          outputTokens: 2,
          thinkingTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUsd: 0.01,
        },
      },
    ])
  })

  it("出力が同じ数なら、モデル名の昇順で並べる", () => {
    const records = [
      record("2026-09-22T09:00:00+09:00", [usage("zeta", 10, 5, 0.1), usage("alpha", 20, 5, 0.1)]),
    ]

    const summary = summarizeTokenUsage(records, {
      startDate: "2026-09-22",
      endDate: "2026-09-22",
    })

    expect(summary.byModel.map((entry) => entry.model)).toEqual(["alpha", "zeta"])
  })

  it("ツールごとに、メインとサブエージェントの内訳を足し合わせる（長さの降順、同じなら名前順）", () => {
    const records = [
      record(
        "2026-09-22T09:00:00+09:00",
        [usage("opus", 100, 20, 0.5)],
        [toolUsage("Bash", 2, 100), toolUsage("Read", 1, 10)],
        [toolUsage("Grep", 1, 40)],
      ),
      record("2026-09-22T10:00:00+09:00", [usage("opus", 50, 10, 0.2)], [toolUsage("Bash", 1, 60)]),
    ]

    const summary = summarizeTokenUsage(records, {
      startDate: "2026-09-22",
      endDate: "2026-09-22",
    })

    expect(summary.byTool).toEqual([
      { name: "Bash", calls: 3, resultBytes: 160 },
      { name: "Grep", calls: 1, resultBytes: 40 },
      { name: "Read", calls: 1, resultBytes: 10 },
    ])
  })
})
