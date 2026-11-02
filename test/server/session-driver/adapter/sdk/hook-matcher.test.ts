import { describe, expect, it } from "vitest"

import { matcherExcluding } from "../../../../../src/server/session-driver/adapter/sdk/hook-matcher.ts"
import {
  GATE_EXEMPT_TOOL_NAMES,
  GATE_EXEMPT_TOOL_PREFIX,
  isGatedTool,
} from "../../../../../src/server/work-plan/core/work-plan-gate.ts"
import { matcherHits } from "../../../../fixture/tool-use-hook-table.ts"

describe("委譲ゲートの matcher", () => {
  const matcher = matcherExcluding(GATE_EXEMPT_TOOL_NAMES, GATE_EXEMPT_TOOL_PREFIX)

  it.each([
    "Read",
    "Grep",
    "Glob",
    "ToolSearch",
    "Bash",
    "Edit",
    "Write",
    "Agent",
    "Skill",
    "AskUserQuestion",
    "mcp__tsukumo__speak",
    "mcp__tsukumo__phase_result",
    "mcp__other__x",
  ])("%s への当たり方が、委譲ゲートが拒むかの判定と一致する", (toolName) => {
    expect(matcherHits(matcher, toolName)).toBe(isGatedTool(toolName))
  })

  it.each(["Read", "Grep", "Glob", "ToolSearch", "mcp__tsukumo__speak"])(
    "%s には当たらず、Bash には当たる",
    (toolName) => {
      expect(matcherHits(matcher, toolName)).toBe(false)
      expect(matcherHits(matcher, "Bash")).toBe(true)
    },
  )

  it("除外の名前の正規表現の特殊文字は逃がし、別の名前を巻き込まない", () => {
    const excluding = matcherExcluding(["a.b"], GATE_EXEMPT_TOOL_PREFIX)

    expect(matcherHits(excluding, "a.b")).toBe(false)
    expect(matcherHits(excluding, "aXb")).toBe(true)
  })
})
