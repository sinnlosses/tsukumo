import { describe, expect, it } from "vitest"

import { withLapHook } from "../../../../src/server/session-driver/adapter/sdk-lap-hook.ts"

const SUBAGENT_START_INPUT = {
  session_id: "s-1",
  transcript_path: "/tmp/tsukumo-test/fake.jsonl",
  cwd: "/tmp/tsukumo-test",
  hook_event_name: "SubagentStart",
  agent_id: "a-1",
  agent_type: "general-purpose",
}

const SKILL_INPUT = {
  session_id: "s-1",
  transcript_path: "/tmp/tsukumo-test/fake.jsonl",
  cwd: "/tmp/tsukumo-test",
  hook_event_name: "PreToolUse",
  tool_name: "Skill",
  tool_input: { skill: "retrospect" },
  tool_use_id: "t-1",
}

const DENY = JSON.stringify({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" },
})

async function callWith(
  run: (stdin: string) => Promise<string>,
  event: "SubagentStart" | "PreToolUse",
  input: unknown,
): Promise<unknown> {
  const hooks = withLapHook({}, false, run)
  const matcher =
    event === "SubagentStart"
      ? hooks.SubagentStart?.[0]
      : hooks.PreToolUse?.find((entry) => entry.matcher === "Skill")
  expect(matcher).toBeDefined()
  // @ts-expect-error テストでは最小の入力だけを渡す
  return matcher?.hooks[0]?.(input, "t-1", { signal: new AbortController().signal })
}

describe("withLapHook の hook", () => {
  it.each([
    ["SubagentStart", SUBAGENT_START_INPUT],
    ["PreToolUse", SKILL_INPUT],
  ] as const)("%s の入力 JSON がそのまま子に渡り、結果は空", async (event, input) => {
    const received: string[] = []
    const result = await callWith(
      async (stdin) => {
        received.push(stdin)
        return ""
      },
      event,
      input,
    )
    expect(result).toEqual({})
    expect(received.map((stdin) => JSON.parse(stdin))).toEqual([input])
  })

  it.each([
    ["失敗・タイムアウトの空の出力", async () => ""],
    ["deny の形の出力", async () => DENY],
    [
      "例外",
      async () => {
        throw new Error("boom")
      },
    ],
  ])("%sでも結果は空で、子の出力を写さない", async (_name, run) => {
    expect(await callWith(run, "SubagentStart", SUBAGENT_START_INPUT)).toEqual({})
    expect(await callWith(run, "PreToolUse", SKILL_INPUT)).toEqual({})
  })
})

describe("withLapHook", () => {
  const base = {
    PreToolUse: [{ matcher: "AskUserQuestion", hooks: [async () => ({})] }],
    Stop: [{ hooks: [async () => ({})] }],
  }
  const run = async () => ""

  it("載せるときは表を変えず、SubagentStart も Skill の matcher も足さない", () => {
    const merged = withLapHook(base, true, run)
    expect(merged).toBe(base)
    expect(merged.SubagentStart).toBeUndefined()
    expect(merged.PreToolUse?.map((entry) => entry.matcher)).toEqual(["AskUserQuestion"])
  })

  it("載せないときは PreToolUse の後ろに Skill の matcher を、SubagentStart に matcher なしの1件を足し、他のキーと元の表は変えない", () => {
    const merged = withLapHook(base, false, run)
    expect(merged.PreToolUse?.map((entry) => entry.matcher)).toEqual(["AskUserQuestion", "Skill"])
    expect(merged.SubagentStart?.map((entry) => entry.matcher)).toEqual([undefined])
    expect(merged.Stop).toBe(base.Stop)
    expect(base.PreToolUse).toHaveLength(1)
    expect(base).not.toHaveProperty("SubagentStart")
  })
})
