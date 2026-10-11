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
    expect(judgeToolAgainstGate(toolName, false, "").kind).toBe("allow")
  })

  it.each(["Bash", "Edit", "Write", "Agent", "SendMessage", "TaskStop", "mcp__other__speak"])(
    "メインの %s は拒む",
    (toolName) => {
      expect(judgeToolAgainstGate(toolName, false, "").kind).toBe("deny")
    },
  )

  it("サブエージェントの中は何でも通す", () => {
    expect(judgeToolAgainstGate("Bash", true, "").kind).toBe("allow")
  })

  it("拒否文の末尾に帯の位置を足し、位置が空なら足さない", () => {
    const bare = judgeToolAgainstGate("Bash", false, "")
    const withPosition = judgeToolAgainstGate("Bash", false, "帯の今の段は 3/4 架空の段。")

    expect(bare.kind === "deny" && withPosition.kind === "deny").toBe(true)
    if (bare.kind === "deny" && withPosition.kind === "deny") {
      expect(withPosition.reason).toBe(`${bare.reason}帯の今の段は 3/4 架空の段。`)
    }
  })
})
