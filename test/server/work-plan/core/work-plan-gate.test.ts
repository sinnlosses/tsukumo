import { describe, expect, it } from "vitest"

import {
  judgeEditAgainstMissingPlan,
  judgeImplementerStop,
  judgeToolAgainstGate,
  judgeWorkflowPhaseIds,
} from "../../../../src/server/work-plan/core/work-plan-gate.ts"
import type { LatestWorkPlan } from "../../../../src/shared/session/work-plan.ts"

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
    const withPosition = judgeToolAgainstGate(
      "Bash",
      false,
      "プログレスバーの今のフェーズは 3/4 架空の段。",
    )

    expect(bare.kind === "deny" && withPosition.kind === "deny").toBe(true)
    if (bare.kind === "deny" && withPosition.kind === "deny") {
      expect(withPosition.reason).toBe(
        `${bare.reason}プログレスバーの今のフェーズは 3/4 架空の段。`,
      )
    }
  })
})

const plan: LatestWorkPlan = {
  kind: "planned",
  phases: ["計画", "実装1", "実装2", "受け入れ", "振り返り"],
  phaseIds: ["plan", "impl-1", "impl-2", "accept", "retrospect"],
  current: 1,
  finishedInGroup: [],
  phaseSummary: "",
  delegatedRange: { kind: "range", first: 1, count: 2 },
  skippedPhases: [],
  awaitingSummary: { kind: "none" },
}

describe("judgeImplementerStop", () => {
  it("実装の範囲の最後の段が済んでいる agent は終われる", () => {
    expect(judgeImplementerStop("impl-1", { ...plan, current: 3 }, false).kind).toBe("allow")
  })

  it("一度止められたあとの終わりは通す（plan-check の agent や stopped の実装役を止め続けない）", () => {
    expect(judgeImplementerStop("impl-1", { ...plan, current: 1 }, true).kind).toBe("allow")
  })

  it("途中の agent は、残りの段の id を添えて止める", () => {
    const verdict = judgeImplementerStop("impl-1", { ...plan, current: 2 }, false)

    expect(verdict.kind).toBe("block")
    if (verdict.kind === "block") {
      expect(verdict.reason).toContain('["impl-2"]')
    }
  })

  it("実装の範囲の外の agent は止めない", () => {
    expect(judgeImplementerStop("accept", plan, false).kind).toBe("allow")
  })
})

describe("judgeWorkflowPhaseIds", () => {
  it("並びが一致すれば通す（{ id, name } の形でも）", () => {
    expect(
      judgeWorkflowPhaseIds(
        "Workflow",
        {
          args: {
            phaseIds: [
              { id: "plan", name: "計画" },
              "impl-1",
              "impl-2",
              { id: "accept", name: "受け入れ" },
              "retrospect",
            ],
          },
        },
        false,
        plan,
      ).kind,
    ).toBe("allow")
  })

  it("並びが違えば、正しい並びを添えて拒む", () => {
    const verdict = judgeWorkflowPhaseIds(
      "Workflow",
      { args: { phaseIds: ["impl-1", "accept"] } },
      false,
      plan,
    )

    expect(verdict.kind).toBe("deny")
    if (verdict.kind === "deny") {
      expect(verdict.reason).toContain('["plan","impl-1","impl-2","accept","retrospect"]')
    }
  })

  it("phaseIds が無い起動は通す", () => {
    expect(judgeWorkflowPhaseIds("Workflow", { args: { taskId: "T" } }, false, plan).kind).toBe(
      "allow",
    )
  })
})
