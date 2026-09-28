import { describe, expect, it } from "vitest"

import { readContextUsage } from "../../../../src/server/session-driver/adapter/sdk-context-usage.ts"
import { UNAVAILABLE_CONTEXT_USAGE } from "../../../../src/shared/context-usage/context-usage.ts"

/**
 * SDK が `getContextUsage()` で返す形の抜粋（手で書いた架空の値。鍵の綴りは実測に合わせた
 * camelCase で、`skills` は1件ずつの並びではなくまとめの中に入っている）。
 */
const SDK_CONTEXT_USAGE = {
  model: "claude-opus-5",
  totalTokens: 49_180,
  maxTokens: 1_000_000,
  rawMaxTokens: 200_000,
  percentage: 25,
  categories: [
    { name: "System prompt", tokens: 7756, kind: "used", color: "blue" },
    { name: "MCP tools (deferred)", tokens: 2159, kind: "deferred", color: "gray" },
    { name: "Free space", tokens: 117_820, kind: "free", color: "gray" },
  ],
  mcpTools: [{ name: "mcp__tsukumo__speak", serverName: "tsukumo", tokens: 170, isLoaded: false }],
  memoryFiles: [{ path: "/架空/CLAUDE.md", type: "Project", tokens: 11_452 }],
  agents: [],
  skills: {
    totalSkills: 2,
    includedSkills: 2,
    tokens: 151,
    skillFrontmatter: [{ name: "架空のスキル", source: "userSettings", tokens: 151 }],
  },
  isAutoCompactEnabled: true,
}

/** `readContextUsage` が要る口だけを持つ偽のセッション。 */
function fakeSession(value: unknown): {
  getContextUsage: (opts: { detail: "full" }) => Promise<unknown>
} {
  return { getContextUsage: () => Promise.resolve(value) }
}

describe("readContextUsage", () => {
  it("SDK の形を画面が要る数と名前だけに写す（窓の大きさは rawMaxTokens）", async () => {
    const report = await readContextUsage(fakeSession(SDK_CONTEXT_USAGE))

    expect(report).toEqual({
      kind: "ready",
      usage: {
        model: "claude-opus-5",
        totalTokens: 49_180,
        maxTokens: 200_000,
        percentage: 25,
        categories: [
          { name: "System prompt", tokens: 7756, kind: "used" },
          { name: "MCP tools (deferred)", tokens: 2159, kind: "deferred" },
          { name: "Free space", tokens: 117_820, kind: "free" },
        ],
        mcpTools: [{ name: "mcp__tsukumo__speak", source: "tsukumo", tokens: 170 }],
        memoryFiles: [{ name: "/架空/CLAUDE.md", source: "Project", tokens: 11_452 }],
        skills: [{ name: "架空のスキル", source: "userSettings", tokens: 151 }],
      },
    })
  })

  it("スキルが1つも無い回（skills が省かれる）でも空の並びとして写す", async () => {
    const report = await readContextUsage(fakeSession({ ...SDK_CONTEXT_USAGE, skills: undefined }))

    expect(report.kind === "ready" ? report.usage.skills : undefined).toEqual([])
  })

  it("読めない形が届いたら「取れない」（例外を投げない）", async () => {
    expect(await readContextUsage(fakeSession({ totalTokens: "たくさん" }))).toEqual(
      UNAVAILABLE_CONTEXT_USAGE,
    )
    expect(await readContextUsage(fakeSession(undefined))).toEqual(UNAVAILABLE_CONTEXT_USAGE)
  })

  it("SDK への問い合わせ自体が失敗しても「取れない」（例外を投げない）", async () => {
    const failing = { getContextUsage: () => Promise.reject(new Error("架空の失敗")) }

    expect(await readContextUsage(failing)).toEqual(UNAVAILABLE_CONTEXT_USAGE)
  })
})
