import { describe, expect, it } from "vitest"

import { judgeToolAgainstGate } from "../../../../src/server/session-driver/core/work-plan-gate.ts"

describe("judgeToolAgainstGate", () => {
  it.each([
    "Read",
    "Grep",
    "Glob",
    "ToolSearch",
    "mcp__tsukumo__speak",
    "mcp__tsukumo__work_plan",
    "mcp__tsukumo__report",
  ])("メインの %s は通す", (toolName) => {
    expect(judgeToolAgainstGate(toolName, false).kind).toBe("allow")
  })

  it.each(["Bash", "Edit", "Write", "Agent", "SendMessage", "TaskStop", "mcp__other__speak"])(
    "メインの %s は拒む",
    (toolName) => {
      expect(judgeToolAgainstGate(toolName, false).kind).toBe("deny")
    },
  )

  it("サブエージェントの中は何でも通す", () => {
    expect(judgeToolAgainstGate("Bash", true).kind).toBe("allow")
  })
})
