import { describe, expect, it } from "vitest"

import {
  judgeEditAgainstMissingPlan,
  judgeToolAgainstGate,
} from "../../../../src/server/work-plan/core/work-plan-gate.ts"

describe("judgeEditAgainstMissingPlan", () => {
  it.each(["Edit", "Write"])(
    "メインの %s は拒み、work_plan を current: 0 で先に渡すよう言う",
    (toolName) => {
      const verdict = judgeEditAgainstMissingPlan(toolName, false, "/repo/src/a.ts")

      expect(verdict.kind).toBe("deny")
      if (verdict.kind === "deny") {
        expect(verdict.reason).toContain("work_plan")
        expect(verdict.reason).toContain("current: 0")
      }
    },
  )

  it("filePath が無い Write は拒む", () => {
    expect(judgeEditAgainstMissingPlan("Write", false, undefined).kind).toBe("deny")
  })

  it.each([
    "Bash",
    "Agent",
    "SendMessage",
    "NotebookEdit",
    "Read",
    "Grep",
    "Glob",
    "ToolSearch",
    "mcp__tsukumo__speak",
  ])("メインの %s は通す", (toolName) => {
    expect(judgeEditAgainstMissingPlan(toolName, false, "/repo/src/a.ts").kind).toBe("allow")
  })

  it.each(["Edit", "Write"])("サブエージェントの中の %s は通す", (toolName) => {
    expect(judgeEditAgainstMissingPlan(toolName, true, "/repo/src/a.ts").kind).toBe("allow")
  })

  it("自動メモリの置き場への書き込みは通す", () => {
    expect(
      judgeEditAgainstMissingPlan("Write", false, "/Users/x/.claude/projects/-a-b/memory/note.md")
        .kind,
    ).toBe("allow")
  })

  it.each([
    "/Users/x/.claude/projects/-a-b/memory/../../settings.json",
    "/repo/projects/a/memory/x.md",
    "/Users/x/.claude/projects/a/other/x.md",
  ])("メモリに似て外れるパス %s は拒む", (filePath) => {
    expect(judgeEditAgainstMissingPlan("Write", false, filePath).kind).toBe("deny")
  })
})

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
