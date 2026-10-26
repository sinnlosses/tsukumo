import { describe, expect, test } from "vitest"

import {
  countTokens,
  findOversizedFiles,
  formatTokenLimitRefusal,
  type StagedChange,
} from "../../../scripts/shared/token-limit.ts"

const EXEMPT_PATH_PATTERNS = [
  "pnpm-lock.yaml",
  "test/e2e/expected/",
  "docs/history/",
  "docs/research/",
  "vendor/",
] as const

function change(overrides: Partial<StagedChange>): StagedChange {
  return { path: "src/a.ts", headBytes: undefined, stagedBytes: 0, binary: false, ...overrides }
}

type JudgmentRow = readonly [name: string, input: StagedChange, rejected: boolean]

describe("大きすぎるファイルの判定", () => {
  test.each<JudgmentRow>([
    ["新規で 20,000 バイトちょうどは通る", change({ stagedBytes: 20000 }), false],
    ["新規で 20,001 バイトは拒む", change({ stagedBytes: 20001 }), true],
    [
      "20,000 以下から 20,001 へ超えるのは拒む",
      change({ headBytes: 19000, stagedBytes: 20001 }),
      true,
    ],
    ["既存の超過が縮むのは通る", change({ headBytes: 25000, stagedBytes: 24000 }), false],
    ["既存の超過が同じ大きさなら通る", change({ headBytes: 25000, stagedBytes: 25000 }), false],
    ["既存の超過が 1 バイト増えると拒む", change({ headBytes: 25000, stagedBytes: 25001 }), true],
    [
      "名前変更は元のパスの HEAD と比べ、縮むなら通る",
      change({ path: "src/new.ts", headBytes: 30000, stagedBytes: 29000 }),
      false,
    ],
    [
      "名前変更は元のパスの HEAD と比べ、増えるなら拒む",
      change({ path: "src/new.ts", headBytes: 30000, stagedBytes: 30500 }),
      true,
    ],
    ["バイナリは大きくても通る", change({ stagedBytes: 900000, binary: true }), false],
    ...EXEMPT_PATH_PATTERNS.map((pattern): JudgmentRow => [
      `除外 ${pattern} は大きくても通る`,
      change({
        path: pattern.endsWith("/") ? `${pattern}a/b.json` : pattern,
        stagedBytes: 90000,
      }),
      false,
    ]),
  ])("%s", (_name, input, rejected) => {
    expect(findOversizedFiles([input]).length > 0).toBe(rejected)
  })

  test("トークン数と増え幅を返す", () => {
    expect(
      findOversizedFiles([
        change({ path: "a.md", stagedBytes: 20004 }),
        change({ path: "b.md", headBytes: 21000, stagedBytes: 22000 }),
      ]),
    ).toEqual([
      { path: "a.md", tokens: 5001, growth: 20004 },
      { path: "b.md", tokens: 5500, growth: 1000 },
    ])
  })
})

describe("トークン数の状態", () => {
  test.each([
    ["超過", "src/a.ts", 20004, { tokens: 5001, limit: 5000, status: "over" }],
    ["近接", "src/a.ts", 18004, { tokens: 4501, limit: 5000, status: "near" }],
    ["余裕", "src/a.ts", 18000, { tokens: 4500, limit: 5000, status: "ok" }],
    ["除外", "vendor/a.json", 90000, { tokens: 22500, limit: 5000, status: "exempt" }],
  ])("%s", (_name, path, bytes, expected) => {
    expect(countTokens(path, bytes)).toEqual(expected)
  })
})

describe("拒否文", () => {
  const oversized = [
    { path: "notes/a.md", tokens: 5001, growth: 20004 },
    { path: "src/b.ts", tokens: 5500, growth: 1000 },
    { path: "src/c.module.css", tokens: 6000, growth: 10 },
    { path: "data.json", tokens: 6000, growth: 10 },
  ]

  test.each([
    "notes/a.md",
    "5001",
    "5000",
    "+20004",
    "同じコミットで",
    "`--no-verify` は使わない",
    "`##` の節の境目",
    "1 ファイル 1 概念",
    "`*.module.css`",
    "区切りの良い境目",
    "EXEMPT_PATH_PATTERNS",
  ])("%s を含む", (phrase) => {
    expect(formatTokenLimitRefusal(oversized)).toContain(phrase)
  })

  test("対象に無い拡張子の手順は出さない", () => {
    expect(formatTokenLimitRefusal([oversized[0]!])).not.toContain("*.module.css")
  })
})
