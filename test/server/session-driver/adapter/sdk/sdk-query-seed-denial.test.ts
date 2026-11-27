import { describe, expect, it } from "vitest"

import { permissionDeniedHooks } from "../../../../../src/server/session-driver/adapter/sdk/sdk-query-seed.ts"
import type { DeniedCall } from "../../../../../src/server/session-driver/core/denial-grant.ts"
import { runPreToolUse } from "../../../../fixture/tool-use-hook-table.ts"

describe("permissionDeniedHooks", () => {
  it("拒否の入力とサブエージェントの id を渡し、retry を返さない", async () => {
    const denied: DeniedCall[] = []
    const hook = permissionDeniedHooks((call) => denied.push(call)).PermissionDenied?.[0]?.hooks[0]

    const output = await hook?.(
      {
        session_id: "s-1",
        transcript_path: "/tmp/tsukumo-test/fake.jsonl",
        cwd: "/tmp/tsukumo-test",
        hook_event_name: "PermissionDenied",
        tool_name: "Write",
        tool_input: { file_path: "/tmp/tsukumo-test/outside.txt" },
        tool_use_id: "toolu_denied",
        reason: "Classifier unavailable",
        agent_id: "agent-1",
        agent_type: "workflow-subagent",
      },
      "toolu_denied",
      { signal: new AbortController().signal },
    )

    expect(output).toEqual({})
    expect(denied).toEqual([
      {
        toolUseId: "toolu_denied",
        toolName: "Write",
        input: { file_path: "/tmp/tsukumo-test/outside.txt" },
        reason: "Classifier unavailable",
        agentId: "agent-1",
        agentType: "workflow-subagent",
      },
    ])
  })
})

describe("preToolUseHooks の一度だけの許可の照合", () => {
  it("Bash は書き換えの前と後の入力で照らし、当たれば書き換えた入力のまま ask を返す", async () => {
    const reviewed: unknown[][] = []
    const output = await runPreToolUse("Bash", { command: "git status" }, undefined, {
      rewriteBash: () => Promise.resolve("rtk git status"),
      reviewByGrant: (_toolName, inputs) => {
        reviewed.push([...inputs])
        return "ask"
      },
    })

    expect(reviewed).toEqual([[{ command: "git status" }, { command: "rtk git status" }]])
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        updatedInput: { command: "rtk git status" },
      },
    })
  })

  it("Bash 以外は照合のフックが ask を返し、外れたら何も返さない", async () => {
    const asked = await runPreToolUse(
      "Write",
      { file_path: "/tmp/tsukumo-test/a.txt" },
      undefined,
      {
        reviewByGrant: () => "ask",
      },
    )
    const passed = await runPreToolUse(
      "Write",
      { file_path: "/tmp/tsukumo-test/a.txt" },
      undefined,
      {
        reviewByGrant: () => "pass",
      },
    )

    expect(asked).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask" },
    })
    expect(passed).toEqual({})
  })
})
