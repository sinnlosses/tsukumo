import { describe, expect, it } from "bun:test"

import { tokenUsageDelta } from "../../../src/server/core/token-usage.ts"
import { type ModelTokenUsage } from "../../../src/shared/token-usage.ts"

// ここで使う数はすべて手で書いた架空のもの（実物の使用量も会話も使わない。
// docs/coding-standards.md「会話内容の扱い」）。
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

describe("tokenUsageDelta", () => {
  it("累計から前回ぶんを引いた増分を返す", () => {
    const previous = [usage("opus", 100, 20, 0.5)]
    const current = [usage("opus", 260, 35, 1.25)]

    expect(tokenUsageDelta(previous, current)).toEqual([usage("opus", 160, 15, 0.75)])
  })

  it("最初のターンは累計がそのまま増分になる", () => {
    expect(tokenUsageDelta([], [usage("opus", 100, 20, 0.5)])).toEqual([
      usage("opus", 100, 20, 0.5),
    ])
  })

  it("累計が振り出しに戻ったターンは負を書かず、いまの累計をそのまま増分にする", () => {
    const previous = [usage("opus", 900, 300, 4)]
    const current = [usage("opus", 120, 40, 0.6)]

    expect(tokenUsageDelta(previous, current)).toEqual([usage("opus", 120, 40, 0.6)])
  })

  it("増えていないモデルは並びに出さない（0だけの行を作らない）", () => {
    const previous = [usage("opus", 100, 20, 0.5), usage("haiku", 10, 2, 0.01)]
    const current = [usage("opus", 100, 20, 0.5), usage("haiku", 30, 5, 0.02)]

    expect(tokenUsageDelta(previous, current)).toEqual([usage("haiku", 20, 3, 0.01)])
  })

  it("途中で増えたモデル（サブエージェント）は全量が増分になる", () => {
    const previous = [usage("opus", 100, 20, 0.5)]
    const current = [usage("opus", 150, 25, 0.7), usage("sonnet", 40, 8, 0.03)]

    expect(tokenUsageDelta(previous, current)).toEqual([
      usage("opus", 50, 5, 0.2),
      usage("sonnet", 40, 8, 0.03),
    ])
  })

  it("1つの数だけが減ったときも、そのモデルは振り出しに戻ったものとして扱う", () => {
    const previous = [usage("opus", 100, 500, 2)]
    const current = [usage("opus", 300, 40, 0.9)]

    expect(tokenUsageDelta(previous, current)).toEqual([usage("opus", 300, 40, 0.9)])
  })

  it("累計から消えたモデルは増分に出ない", () => {
    const previous = [usage("opus", 100, 20, 0.5), usage("sonnet", 40, 8, 0.03)]

    expect(tokenUsageDelta(previous, [usage("opus", 110, 22, 0.55)])).toEqual([
      usage("opus", 10, 2, 0.05),
    ])
  })
})
