import { describe, expect, it } from "vitest"

import { runPreToolUse } from "../../../../fixture/tool-use-hook-table.ts"

const SUBAGENT_TOOL_NAMES = [
  "Read",
  "Grep",
  "Glob",
  "ToolSearch",
  "Edit",
  "Write",
  "Agent",
  "Skill",
  "AskUserQuestion",
  "mcp__tsukumo__speak",
  "mcp__tsukumo__phase_result",
  "mcp__other__tool",
] as const

const MARKS = [false, true].flatMap((gateRaised) =>
  [false, true].map((planMissing) => ({ gateRaised, planMissing })),
)

const INPUT = {
  command: "ls",
  file_path: "/repo/a.ts",
  prompt: "手順",
}

const setupOf = (marks: { gateRaised: boolean; planMissing: boolean }) => ({
  gateRaised: () => marks.gateRaised,
  planMissing: () => marks.planMissing,
  rewriteBash: (command: string) => Promise.resolve(`rtk ${command}`),
})

describe("preToolUseHooks（サブエージェントの中の呼び出しは、Bash の差し替えを除いて対象にならない）", () => {
  it.each(
    SUBAGENT_TOOL_NAMES.flatMap((toolName) => MARKS.map((marks) => ({ toolName, ...marks }))),
  )("$toolName gate=$gateRaised plan=$planMissing", async ({ toolName, ...marks }) => {
    expect(await runPreToolUse(toolName, INPUT, "sub-1", setupOf(marks))).toEqual({})
  })

  it.each(MARKS)(
    "Bash は印によらず差し替えだけ受ける: gate=$gateRaised plan=$planMissing",
    async (marks) => {
      expect(await runPreToolUse("Bash", INPUT, "sub-1", setupOf(marks))).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          updatedInput: { ...INPUT, command: "rtk ls" },
        },
      })
    },
  )
})

describe("preToolUseHooks（Bash の差し替えは command 以外のキーを保つ）", () => {
  it("timeout・description を残す", async () => {
    const input = { command: "ls", timeout: 5000, description: "一覧" }
    expect(
      await runPreToolUse(
        "Bash",
        input,
        undefined,
        setupOf({ gateRaised: false, planMissing: false }),
      ),
    ).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: { ...input, command: "rtk ls" },
      },
    })
  })
})
