import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

import {
  runAskGuard,
  withAskGuard,
} from "../../../../src/server/session-driver/adapter/sdk-ask-guard.ts"
import type { WorkflowTwResult } from "../../../../src/server/session-driver/adapter/sdk-workflow-tw.ts"
import type { WorkflowTwFailurePlace } from "../../../../src/server/session-driver/core/session-driver.ts"

function ok(stdout: string): WorkflowTwResult {
  return { kind: "ok", stdout }
}

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

async function callWith(
  run: (stdin: string) => Promise<WorkflowTwResult>,
  input: unknown,
  report: (place: WorkflowTwFailurePlace) => void = () => {},
): Promise<unknown> {
  const matcher = withAskGuard({}, false, run, report).PreToolUse?.find(
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
      return ok(JSON.stringify(DENY))
    }, input)
    expect(result).toEqual(DENY)
    expect(received.map((stdin) => JSON.parse(stdin))).toEqual([input])
  })

  it.each([
    ["空の出力", async () => ok(""), undefined],
    [
      "deny でない出力",
      async () => ok(JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } })),
      undefined,
    ],
    ["読めない出力", async () => ok("not json"), "ask-guard-unreadable"],
    ["失敗", async () => ({ kind: "failed" }) satisfies WorkflowTwResult, "ask-guard-failed"],
    [
      "時間切れ",
      async () => ({ kind: "timed-out" }) satisfies WorkflowTwResult,
      "ask-guard-timed-out",
    ],
    [
      "起動できない",
      async () => ({ kind: "not-started" }) satisfies WorkflowTwResult,
      "ask-guard-not-started",
    ],
    [
      "例外",
      async (): Promise<WorkflowTwResult> => {
        throw new Error("boom")
      },
      "ask-guard-failed",
    ],
  ])("%sは何も拒まず、足跡は必要なときだけ1件", async (_name, run, place) => {
    const reported: WorkflowTwFailurePlace[] = []
    expect(
      await callWith(run, inputOf("AskUserQuestion"), (reportedPlace) => {
        reported.push(reportedPlace)
      }),
    ).toEqual({})
    expect(reported).toEqual(place === undefined ? [] : [place])
  })

  it("AskUserQuestion 以外のツールと PreToolUse 以外のイベントでは子を呼ばない", async () => {
    const run = vi.fn<(stdin: string) => Promise<WorkflowTwResult>>(async () =>
      ok(JSON.stringify(DENY)),
    )
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
  const run = async () => ok("")

  it("載せるときは表を変えない", () => {
    expect(withAskGuard(base, true, run, () => {})).toBe(base)
  })

  it("載せないときは PreToolUse の後ろに AskUserQuestion の matcher を足し、他のキーと元の表は変えない", () => {
    const merged = withAskGuard(base, false, run, () => {})
    expect(merged.PreToolUse?.map((entry) => entry.matcher)).toEqual([undefined, "AskUserQuestion"])
    expect(merged.Stop).toBe(base.Stop)
    expect(base.PreToolUse).toHaveLength(1)
  })
})

describe("runAskGuard", () => {
  it("渡された tw のパスを ask-guard で起こし、標準入力を渡す", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tsukumo-ask-guard-"))
    try {
      const twPath = join(dir, "tw")
      await writeFile(twPath, '#!/bin/sh\nprintf "%s:" "$1"; cat\n')
      await chmod(twPath, 0o755)

      expect(await runAskGuard(twPath, '{"a":1}')).toEqual({
        kind: "ok",
        stdout: 'ask-guard:{"a":1}',
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
