import { describe, expect, it } from "vitest"

import {
  denialAgentStopHooks,
  mergeHookMatchers,
} from "../../../../../src/server/session-driver/adapter/sdk/sdk-denial-agent-stop-hook.ts"

describe("denialAgentStopHooks", () => {
  it("SubagentStop の agent_id を渡し、止めない", async () => {
    const finished: string[] = []
    const hook = denialAgentStopHooks((id) => finished.push(id)).SubagentStop?.[0]?.hooks[0]

    const output = await hook?.(
      {
        session_id: "s-1",
        transcript_path: "/tmp/tsukumo-test/fake.jsonl",
        cwd: "/tmp/tsukumo-test",
        hook_event_name: "SubagentStop",
        stop_hook_active: false,
        agent_id: "agent-1",
        agent_transcript_path: "/tmp/tsukumo-test/agent.jsonl",
        agent_type: "workflow-subagent",
        last_assistant_message: "",
      },
      undefined,
      { signal: new AbortController().signal },
    )

    expect(output).toEqual({})
    expect(finished).toEqual(["agent-1"])
  })
})

describe("mergeHookMatchers", () => {
  it("同じイベントの matcher の並びを足し合わせる", () => {
    const a = denialAgentStopHooks(() => {})
    const b = denialAgentStopHooks(() => {})

    expect(mergeHookMatchers(a, b).SubagentStop).toHaveLength(2)
  })
})
