import { describe, expect, test } from "vitest"

import { parseClaudeResult } from "../../../scripts/shared/claude-result.ts"

describe("parseClaudeResult", () => {
  test("usage の4種の合計をトークンに、duration_ms を時間に、拒否の数を数える", () => {
    const stdout = JSON.stringify({
      duration_ms: 3678,
      permission_denials: [{}, {}],
      usage: {
        input_tokens: 2,
        output_tokens: 167,
        cache_creation_input_tokens: 21492,
        cache_read_input_tokens: 11342,
      },
    })

    expect(parseClaudeResult(stdout)).toEqual({ tokens: 33003, durationMs: 3678, denials: 2 })
  })

  test("形が違えば例外", () => {
    expect(() => parseClaudeResult("{}")).toThrow(/expected/)
  })
})
