import { describe, expect, test } from "vitest"

import {
  countTokens,
  findOversizedFiles,
  formatTokenLimitWarning,
  splitStepsFor,
  type StagedChange,
} from "../../../scripts/shared/token-limit.ts"

const EXEMPT_PATH_PATTERNS = [
  "pnpm-lock.yaml",
  "test/e2e/expected/",
  "docs/history/",
  "docs/research/",
  "vendor/",
  "src/browser/components/ui/theme-root/built/",
] as const

/** 実在しない文書のパスを `docs/…` の字面で書くと節の参照の検査が拾うので、組み立てて作る。 */
const DOCS_DIR = "docs"
const docPath = (name: string) => `${DOCS_DIR}/${name}`

function change(overrides: Partial<StagedChange>): StagedChange {
  return { path: "src/a.ts", headBytes: undefined, stagedBytes: 0, binary: false, ...overrides }
}

type JudgmentRow = readonly [name: string, input: StagedChange, oversized: boolean]

describe("大きすぎるファイルの判定", () => {
  test.each<JudgmentRow>([
    ["新規で 24,000 バイトちょうどは超えない", change({ stagedBytes: 24000 }), false],
    ["新規で 24,001 バイトは超える", change({ stagedBytes: 24001 }), true],
    [
      "24,000 以下から 24,001 へ超えるのは拾う",
      change({ headBytes: 23000, stagedBytes: 24001 }),
      true,
    ],
    ["既存の超過が縮むのは拾わない", change({ headBytes: 30000, stagedBytes: 29000 }), false],
    ["既存の超過が同じ大きさなら拾わない", change({ headBytes: 30000, stagedBytes: 30000 }), false],
    ["既存の超過が 1 バイト増えると拾う", change({ headBytes: 30000, stagedBytes: 30001 }), true],
    [
      "名前変更は元のパスの HEAD と比べ、縮むなら拾わない",
      change({ path: "src/new.ts", headBytes: 30000, stagedBytes: 29000 }),
      false,
    ],
    [
      "名前変更は元のパスの HEAD と比べ、増えるなら拾う",
      change({ path: "src/new.ts", headBytes: 30000, stagedBytes: 30500 }),
      true,
    ],
    [
      "docs の .md は 48,000 バイトちょうどまで超えない",
      change({ path: docPath("a.md"), stagedBytes: 48000 }),
      false,
    ],
    [
      "docs の .md は 48,001 バイトで超える",
      change({ path: docPath("architecture/a.md"), stagedBytes: 48001 }),
      true,
    ],
    [
      "docs の .md でも既存の超過が縮むなら拾わない",
      change({ path: docPath("a.md"), headBytes: 50000, stagedBytes: 49000 }),
      false,
    ],
    [
      "docs の .md 以外はコードの上限のまま",
      change({ path: "docs/a.ts", stagedBytes: 24001 }),
      true,
    ],
    [
      "docs の外の .md はコードの上限のまま",
      change({ path: "README.md", stagedBytes: 24001 }),
      true,
    ],
    ["バイナリは大きくても拾わない", change({ stagedBytes: 900000, binary: true }), false],
    ...EXEMPT_PATH_PATTERNS.map((pattern): JudgmentRow => [
      `除外 ${pattern} は大きくても拾わない`,
      change({
        path: pattern.endsWith("/") ? `${pattern}a/b.json` : pattern,
        stagedBytes: 90000,
      }),
      false,
    ]),
  ])("%s", (_name, input, oversized) => {
    expect(findOversizedFiles([input]).length > 0).toBe(oversized)
  })

  test("トークン数と増え幅を返す", () => {
    expect(
      findOversizedFiles([
        change({ path: "a.md", stagedBytes: 24004 }),
        change({ path: "b.md", headBytes: 25000, stagedBytes: 26000 }),
        change({ path: docPath("c.md"), stagedBytes: 48004 }),
      ]),
    ).toEqual([
      { path: "a.md", tokens: 6001, limit: 6000, growth: 24004 },
      { path: "b.md", tokens: 6500, limit: 6000, growth: 1000 },
      { path: docPath("c.md"), tokens: 12001, limit: 12000, growth: 48004 },
    ])
  })
})

describe("トークン数の状態", () => {
  test.each([
    ["超過", "src/a.ts", 24004, { tokens: 6001, limit: 6000, status: "over" }],
    ["近接", "src/a.ts", 21604, { tokens: 5401, limit: 6000, status: "near" }],
    ["余裕", "src/a.ts", 21600, { tokens: 5400, limit: 6000, status: "ok" }],
    ["除外", "vendor/a.json", 90000, { tokens: 22500, limit: 6000, status: "exempt" }],
    ["docs の超過", docPath("a.md"), 48004, { tokens: 12001, limit: 12000, status: "over" }],
    ["docs の近接", docPath("a.md"), 43204, { tokens: 10801, limit: 12000, status: "near" }],
    ["docs の余裕", docPath("a.md"), 20004, { tokens: 5001, limit: 12000, status: "ok" }],
  ])("%s", (_name, path, bytes, expected) => {
    expect(countTokens(path, bytes)).toEqual(expected)
  })
})

describe("警告文", () => {
  const oversized = [
    { path: "notes/a.md", tokens: 6001, limit: 6000, growth: 24004 },
    { path: docPath("d.md"), tokens: 12500, limit: 12000, growth: 100 },
  ]

  test.each(["notes/a.md", "6001", "上限 6000", "上限 12000", "+24004", "コミットは止めません"])(
    "%s を含む",
    (phrase) => {
      expect(formatTokenLimitWarning(oversized)).toContain(phrase)
    },
  )
})

describe("縮める手順", () => {
  test("拡張子ごとの手順と除外の相談を出し、対象に無い拡張子の手順は出さない", () => {
    const steps = splitStepsFor(["notes/a.md", "src/b.ts", "data.json"]).join("\n")

    expect(steps).toContain("`##` の節の境目")
    expect(steps).toContain("1 ファイル 1 概念")
    expect(steps).toContain("区切りの良い境目")
    expect(steps).toContain("EXEMPT_PATH_PATTERNS")
    expect(steps).not.toContain("*.module.css")
  })
})
