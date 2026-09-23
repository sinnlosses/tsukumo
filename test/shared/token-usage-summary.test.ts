import { describe, expect, it } from "bun:test"

import {
  DEFAULT_TOKEN_USAGE_DAYS,
  EMPTY_TOKEN_USAGE_SUMMARY,
  readTokenUsageDays,
  readTokenUsageSummary,
  type TokenUsageSummary,
} from "../../src/shared/token-usage-summary.ts"

// ここで使う数はすべて手で書いた架空のもの（実物の記録は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_TOTALS = {
  inputTokens: 12,
  outputTokens: 34,
  thinkingTokens: 0,
  cacheReadInputTokens: 56,
  cacheCreationInputTokens: 78,
  costUsd: 0.5,
}

const FIXTURE_SUMMARY = {
  trend: { unit: "hour", points: [{ key: "09", totals: FIXTURE_TOTALS }] },
  byModel: [{ model: "架空モデル", totals: FIXTURE_TOTALS }],
  byTool: [{ name: "Bash", calls: 3, resultBytes: 800 }],
} satisfies TokenUsageSummary

describe("readTokenUsageDays", () => {
  it("選べる期間はそのまま読む（1日・7日・30日）", () => {
    expect(readTokenUsageDays("1")).toBe(1)
    expect(readTokenUsageDays("7")).toBe(7)
    expect(readTokenUsageDays("30")).toBe(30)
  })

  it("選べない値・数でない値・無いときは既定に落ちる", () => {
    expect(readTokenUsageDays("2")).toBe(DEFAULT_TOKEN_USAGE_DAYS)
    expect(readTokenUsageDays("きのう")).toBe(DEFAULT_TOKEN_USAGE_DAYS)
    expect(readTokenUsageDays(undefined)).toBe(DEFAULT_TOKEN_USAGE_DAYS)
  })
})

describe("readTokenUsageSummary", () => {
  it("推移の刻みと点を含む形はそのまま読む", () => {
    expect(readTokenUsageSummary(FIXTURE_SUMMARY)).toEqual(FIXTURE_SUMMARY)
  })

  it("刻みが知らない値・推移が無い形は空の集計に落ちる（画面は一言だけになる）", () => {
    expect(
      readTokenUsageSummary({ ...FIXTURE_SUMMARY, trend: { unit: "週", points: [] } }),
    ).toEqual(EMPTY_TOKEN_USAGE_SUMMARY)
    expect(readTokenUsageSummary({ byModel: [], byTool: [] })).toEqual(EMPTY_TOKEN_USAGE_SUMMARY)
    expect(readTokenUsageSummary("集計ではない")).toEqual(EMPTY_TOKEN_USAGE_SUMMARY)
  })
})
