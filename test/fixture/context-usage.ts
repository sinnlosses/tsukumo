// テストが使う、手で書いた架空のコンテキストの内訳（`docs/glossary.md`「コンテキストの内訳」）。
// 形は `test/fixture/session-record.ts` と同じで、既定を1つ持ち、呼ぶ側は**違うところだけ**を
// 渡す。
//
// **数は架空だが、分類の並びと種別だけ本物に合わせてある**（`used` の合計が `totalTokens`、
// それに `buffer` と `free` を足すと `maxTokens` になる）。実物のセッションの値は使わない
// （docs/coding-standards.md「会話内容の扱い」）。

import { type ContextUsage, type ContextUsageReport } from "../../src/shared/context-usage.ts"

/** 架空の内訳1つ。**違うところだけ**を渡す。 */
export function contextUsage(overrides: Partial<ContextUsage> = {}): ContextUsage {
  return {
    model: "claude-opus-5",
    totalTokens: 60_000,
    maxTokens: 200_000,
    percentage: 30,
    categories: [
      { name: "System prompt", tokens: 8000, kind: "used" },
      { name: "System tools", tokens: 12_000, kind: "used" },
      { name: "MCP tools (deferred)", tokens: 3000, kind: "deferred" },
      { name: "Memory files", tokens: 10_000, kind: "used" },
      { name: "Messages", tokens: 30_000, kind: "used" },
      { name: "Autocompact buffer", tokens: 45_000, kind: "buffer" },
      { name: "Free space", tokens: 95_000, kind: "free" },
    ],
    mcpTools: [{ name: "mcp__tsukumo__speak", source: "tsukumo", tokens: 180 }],
    memoryFiles: [{ name: "CLAUDE.md", source: "Project", tokens: 10_000 }],
    skills: [{ name: "架空のスキル", source: "userSettings", tokens: 120 }],
    ...overrides,
  }
}

/** 取れたときの結果（中身は {@link contextUsage}）。 */
export function readyContextUsage(overrides: Partial<ContextUsage> = {}): ContextUsageReport {
  return { kind: "ready", usage: contextUsage(overrides) }
}
