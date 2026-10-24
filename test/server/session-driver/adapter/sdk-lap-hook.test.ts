import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  runLapHook,
  withLapHook,
} from "../../../../src/server/session-driver/adapter/sdk-lap-hook.ts"
import type { WorkflowTwResult } from "../../../../src/server/session-driver/adapter/sdk-workflow-tw.ts"
import type { WorkflowTwFailurePlace } from "../../../../src/server/session-driver/core/session-driver.ts"

function ok(stdout: string): WorkflowTwResult {
  return { kind: "ok", stdout }
}

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
  run: (stdin: string) => Promise<WorkflowTwResult>,
  event: "SubagentStart" | "PreToolUse",
  input: unknown,
  report: (place: WorkflowTwFailurePlace) => void = () => {},
): Promise<unknown> {
  const hooks = withLapHook({}, false, run, report)
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
        return ok("")
      },
      event,
      input,
    )
    expect(result).toEqual({})
    expect(received.map((stdin) => JSON.parse(stdin))).toEqual([input])
  })

  it("deny の形の出力でも結果は空で、子の出力を写さず、足跡も残さない", async () => {
    const reported: WorkflowTwFailurePlace[] = []
    const report = (place: WorkflowTwFailurePlace) => {
      reported.push(place)
    }
    expect(
      await callWith(async () => ok(DENY), "SubagentStart", SUBAGENT_START_INPUT, report),
    ).toEqual({})
    expect(await callWith(async () => ok(DENY), "PreToolUse", SKILL_INPUT, report)).toEqual({})
    expect(reported).toEqual([])
  })

  it.each([
    ["失敗", async () => ({ kind: "failed" }) satisfies WorkflowTwResult, "lap-hook-failed"],
    [
      "時間切れ",
      async () => ({ kind: "timed-out" }) satisfies WorkflowTwResult,
      "lap-hook-timed-out",
    ],
    [
      "起動できない",
      async () => ({ kind: "not-started" }) satisfies WorkflowTwResult,
      "lap-hook-not-started",
    ],
    [
      "例外",
      async (): Promise<WorkflowTwResult> => {
        throw new Error("boom")
      },
      "lap-hook-failed",
    ],
  ])("%sでも結果は空で、足跡が1件残る", async (_name, run, place) => {
    const reported: WorkflowTwFailurePlace[] = []
    const result = await callWith(run, "SubagentStart", SUBAGENT_START_INPUT, (reportedPlace) => {
      reported.push(reportedPlace)
    })
    expect(result).toEqual({})
    expect(reported).toEqual([place])
  })
})

describe("withLapHook", () => {
  const base = {
    PreToolUse: [{ matcher: "AskUserQuestion", hooks: [async () => ({})] }],
    Stop: [{ hooks: [async () => ({})] }],
  }
  const run = async () => ok("")

  it("載せるときは表を変えず、SubagentStart も Skill の matcher も足さない", () => {
    const merged = withLapHook(base, true, run, () => {})
    expect(merged).toBe(base)
    expect(merged.SubagentStart).toBeUndefined()
    expect(merged.PreToolUse?.map((entry) => entry.matcher)).toEqual(["AskUserQuestion"])
  })

  it("載せないときは PreToolUse の後ろに Skill の matcher を、SubagentStart に matcher なしの1件を足し、他のキーと元の表は変えない", () => {
    const merged = withLapHook(base, false, run, () => {})
    expect(merged.PreToolUse?.map((entry) => entry.matcher)).toEqual(["AskUserQuestion", "Skill"])
    expect(merged.SubagentStart?.map((entry) => entry.matcher)).toEqual([undefined])
    expect(merged.Stop).toBe(base.Stop)
    expect(base.PreToolUse).toHaveLength(1)
    expect(base).not.toHaveProperty("SubagentStart")
  })
})

describe("runLapHook", () => {
  it("渡された tw のパスを lap-hook で起こし、標準入力を渡す", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tsukumo-lap-hook-"))
    try {
      const twPath = join(dir, "tw")
      await writeFile(twPath, '#!/bin/sh\nprintf "%s:" "$1"; cat\n')
      await chmod(twPath, 0o755)

      expect(await runLapHook(twPath, '{"a":1}')).toEqual({
        kind: "ok",
        stdout: 'lap-hook:{"a":1}',
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
