import { describe, expect, it, vi } from "vitest"

import { withAskGuard } from "../../../../src/server/session-driver/adapter/sdk-ask-guard.ts"

const DENY = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "質問せず止める",
  },
}

function inputOf(toolName: string, eventName = "PreToolUse") {
  return {
    session_id: "s-1",
    transcript_path: "/tmp/tsukumo-test/fake.jsonl",
    cwd: "/tmp/tsukumo-test",
    hook_event_name: eventName,
    tool_name: toolName,
    tool_input: {},
    tool_use_id: "t-1",
  }
}

async function callWith(run: (stdin: string) => Promise<string>, input: unknown): Promise<unknown> {
  const matcher = withAskGuard({}, false, run).PreToolUse?.find(
    (entry) => entry.matcher === "AskUserQuestion",
  )
  expect(matcher?.matcher).toBe("AskUserQuestion")
  // @ts-expect-error テストでは最小の入力だけを渡す
  return matcher?.hooks[0]?.(input, "t-1", { signal: new AbortController().signal })
}

describe("withAskGuard の AskUserQuestion の hook", () => {
  it("子の deny の JSON はそのまま返り、入力は cwd を含めて子に渡る", async () => {
    const received: string[] = []
    const input = inputOf("AskUserQuestion")
    const result = await callWith(async (stdin) => {
      received.push(stdin)
      return JSON.stringify(DENY)
    }, input)
    expect(result).toEqual(DENY)
    expect(received.map((stdin) => JSON.parse(stdin))).toEqual([input])
  })

  it.each([
    ["空の出力", async () => ""],
    ["読めない出力", async () => "not json"],
    [
      "deny でない出力",
      async () => JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } }),
    ],
    [
      "例外",
      async () => {
        throw new Error("boom")
      },
    ],
  ])("%sは何も拒まない", async (_name, run) => {
    expect(await callWith(run, inputOf("AskUserQuestion"))).toEqual({})
  })

  it("AskUserQuestion 以外のツールと PreToolUse 以外のイベントでは子を呼ばない", async () => {
    const run = vi.fn(async () => JSON.stringify(DENY))
    expect(await callWith(run, inputOf("Bash"))).toEqual({})
    expect(await callWith(run, inputOf("AskUserQuestion", "PostToolUse"))).toEqual({})
    expect(run).toHaveBeenCalledTimes(0)
  })
})

describe("withAskGuard", () => {
  const base = {
    PreToolUse: [{ hooks: [async () => ({})] }],
    Stop: [{ hooks: [async () => ({})] }],
  }
  const run = async () => ""

  it("載せるときは表を変えない", () => {
    expect(withAskGuard(base, true, run)).toBe(base)
  })

  it("載せないときは PreToolUse の後ろに AskUserQuestion の matcher を足し、他のキーと元の表は変えない", () => {
    const merged = withAskGuard(base, false, run)
    expect(merged.PreToolUse?.map((entry) => entry.matcher)).toEqual([undefined, "AskUserQuestion"])
    expect(merged.Stop).toBe(base.Stop)
    expect(base.PreToolUse).toHaveLength(1)
  })
})
