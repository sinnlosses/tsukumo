import type { HookInput } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import { implementerStopHooks } from "../../../../../src/server/session-driver/adapter/sdk/sdk-implementer-stop-hook.ts"
import type { LatestWorkPlan } from "../../../../../src/shared/session/work-plan.ts"

const plan: LatestWorkPlan = {
  kind: "planned",
  phases: ["計画", "実装1", "受け入れ"],
  phaseIds: ["plan", "impl-1", "accept"],
  current: 1,
  finishedInGroup: [],
  phaseSummary: "",
  delegatedRange: { kind: "range", first: 1, count: 1 },
  skippedPhases: [],
  awaitingSummary: { kind: "none" },
}

async function run(phaseOf: (agentId: string) => string | undefined) {
  const hook = implementerStopHooks({ latestPlan: () => plan, workflowAgentPhase: phaseOf })
    .SubagentStop?.[0]?.hooks[0]
  const input: HookInput = {
    hook_event_name: "SubagentStop",
    session_id: "s1",
    transcript_path: "/t.jsonl",
    cwd: "/repo",
    agent_id: "a1",
    agent_transcript_path: "/a.jsonl",
    agent_type: "general-purpose",
    stop_hook_active: false,
  }
  return hook?.(input, undefined, { signal: new AbortController().signal })
}

describe("implementerStopHooks", () => {
  it("写しに無い agent は止めない", async () => {
    expect(await run(() => undefined)).toEqual({})
  })

  it("写しにあり、実装の範囲の最後の段まで申告していない agent は止める", async () => {
    expect(await run(() => "impl-1")).toMatchObject({ decision: "block" })
  })
})
