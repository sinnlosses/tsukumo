import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"

// 委譲先の返却は `UserPromptSubmit` の入力の頭（`HANDBACK_PROMPT_HEADS`）で見分けていて、入力の欄は見ていない。
// 見分けうる欄が増えた・変わったら、`sdk-handback-note-hook.ts` の見分けを見直す。
const SDK_TYPES_PATH = `${REPOSITORY_ROOT}/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
const KNOWN_SOURCES = ["user", "sdk", "system", "loop_wakeup", "schedule_wakeup", "poll_event"]
const CHANGED =
  "返却を見分けうる欄が変わった。sdk-handback-note-hook.ts の見分け（HANDBACK_PROMPT_HEADS の頭の一致）を見直す"

function userPromptSubmitHookInput(): string {
  const text = readFileSync(SDK_TYPES_PATH, "utf8")
  const start = text.indexOf("export declare type UserPromptSubmitHookInput = BaseHookInput & {")
  if (start < 0) return ""
  const end = text.indexOf("\n};", start)
  return end < 0 ? "" : text.slice(start, end)
}

describe("同梱の Agent SDK の UserPromptSubmitHookInput", () => {
  it("型を切り出せる", () => {
    expect(userPromptSubmitHookInput(), `型の名や形が変わった。${CHANGED}`).not.toBe("")
  })

  it("origin の欄を持たない", () => {
    expect(userPromptSubmitHookInput(), CHANGED).not.toMatch(/^\s*origin\??:/m)
  })

  it("source の値が既知の6つだけである", () => {
    const declaration = /^\s*source\?:\s*([^;]+);/m.exec(userPromptSubmitHookInput())
    const values = declaration?.[1]?.match(/'([^']+)'/g)?.map((quoted) => quoted.slice(1, -1))
    expect(values, CHANGED).toEqual(KNOWN_SOURCES)
  })
})
