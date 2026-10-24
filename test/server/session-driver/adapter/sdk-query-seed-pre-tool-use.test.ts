import type { BaseHookInput } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import { preToolUseHooks } from "../../../../src/server/session-driver/adapter/sdk-query-seed.ts"
import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import {
  createExternalToolMark,
  type ExternalToolMark,
} from "../../../../src/server/session-driver/core/external-tool-mark.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

async function runPreToolUse(
  toolName: string,
  toolInput: unknown,
  agentId?: string,
  gateRaised: () => boolean = () => false,
  bandPosition: () => string = () => "",
  onEvent: (event: SessionEvent) => void = () => {},
  settings: Pick<BaseHookInput, "effort" | "permission_mode"> = {},
  externalToolMark: ExternalToolMark = createExternalToolMark(),
  rewriteBash: (command: string) => Promise<string | undefined> = () => Promise.resolve(undefined),
  planMissing?: () => boolean,
): Promise<unknown> {
  const callback = preToolUseHooks(
    gateRaised,
    bandPosition,
    onEvent,
    externalToolMark,
    rewriteBash,
    planMissing,
  ).PreToolUse?.[0]?.hooks[0]
  expect(callback).toBeDefined()
  return callback?.(
    {
      session_id: "s-1",
      transcript_path: "/tmp/tsukumo-test/fake.jsonl",
      cwd: "/tmp/tsukumo-test",
      hook_event_name: "PreToolUse",
      tool_name: toolName,
      tool_input: toolInput,
      tool_use_id: "t-1",
      ...(agentId === undefined ? {} : { agent_id: agentId }),
      ...settings,
    },
    "t-1",
    { signal: new AbortController().signal },
  )
}

describe("preToolUseHooks が見届けた設定を流す", () => {
  it("メインの呼び出しでは effort.level と permission_mode を setting-confirmed にする", async () => {
    const events: SessionEvent[] = []
    await runPreToolUse(
      "Read",
      {},
      undefined,
      () => false,
      () => "",
      (event) => events.push(event),
      { effort: { level: "high" }, permission_mode: "plan" },
    )
    expect(events).toEqual([
      { kind: "setting-confirmed", setting: "effort", value: "high" },
      { kind: "setting-confirmed", setting: "permissionMode", value: "plan" },
    ])
  })

  it("effort が無い入力では effort を出さず、サブエージェントの中の呼び出しは何も出さない", async () => {
    const mainEvents: SessionEvent[] = []
    await runPreToolUse(
      "Read",
      {},
      undefined,
      () => false,
      () => "",
      (event) => mainEvents.push(event),
      { permission_mode: "default" },
    )
    expect(mainEvents).toEqual([
      { kind: "setting-confirmed", setting: "permissionMode", value: "default" },
    ])

    const subEvents: SessionEvent[] = []
    await runPreToolUse(
      "Read",
      {},
      "sub-1",
      () => false,
      () => "",
      (event) => subEvents.push(event),
      { effort: { level: "high" }, permission_mode: "plan" },
    )
    expect(subEvents).toEqual([])
  })
})

describe("preToolUseHooks（Agent を背景に固定し、委譲ゲートで作業のツールを拒む）", () => {
  const DENIED = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining("work_plan"),
    },
  }

  it("印が立っているあいだ、メインの作業のツールと Agent は拒み、背景固定は返さない", async () => {
    expect(await runPreToolUse("Bash", { command: "ls" }, undefined, () => true)).toEqual(DENIED)
    expect(await runPreToolUse("Agent", { prompt: "手順" }, undefined, () => true)).toEqual(DENIED)
  })

  it("印が立っていても、読み取り・tsukumo のツール・サブエージェントの中の呼び出しは通す", async () => {
    const raised = () => true
    expect(await runPreToolUse("Read", {}, undefined, raised)).toEqual({})
    expect(await runPreToolUse("mcp__tsukumo__report", {}, undefined, raised)).toEqual({})
    expect(await runPreToolUse("Bash", {}, "sub-1", raised)).toEqual({})
  })

  it("印が下りていれば作業のツールを通す", async () => {
    expect(await runPreToolUse("Bash", { command: "ls" })).toEqual({})
  })

  it("返却を受けた CallReview の印に従い、受け付けた work_plan のあとは通す", async () => {
    const review = createCallReview()
    const plan = {
      phases: ["架空の段A", "架空の段B"],
      current: 0,
      phaseSummary: "",
      delegatedRange: { first: 0, count: 2 },
    }
    review.pass(requestEvent())
    review.judgeWorkPlan(plan)
    review.pass({ kind: "delegate-handed-back", delegate: "toolu_delegate" })

    expect(
      await runPreToolUse("Bash", {}, undefined, review.gateRaised, review.bandPosition),
    ).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("帯の今の段は 本 1/2 架空の段A。"),
      },
    })
    review.judgeWorkPlan({ ...plan, current: 1, phaseSummary: "架空のまとめ。" })
    expect(await runPreToolUse("Bash", {}, undefined, review.gateRaised)).toEqual({})
  })

  it("run_in_background の無い Agent は updatedInput で true にし、permissionDecision は返さない", async () => {
    expect(await runPreToolUse("Agent", { prompt: "手順" })).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: { prompt: "手順", run_in_background: true },
      },
    })
  })
})

describe("preToolUseHooks（work_plan の前に Edit・Write を拒む）", () => {
  const DENIED = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining("work_plan"),
    },
  }
  const run = (
    toolName: string,
    toolInput: unknown,
    agentId: string | undefined,
    missing: boolean,
  ) =>
    runPreToolUse(
      toolName,
      toolInput,
      agentId,
      () => false,
      () => "",
      () => {},
      {},
      createExternalToolMark(),
      () => Promise.resolve(undefined),
      () => missing,
    )

  it("ワークプランが無いあいだ、メインの Edit・Write を拒む", async () => {
    expect(await run("Edit", { file_path: "/repo/a.ts" }, undefined, true)).toEqual(DENIED)
    expect(await run("Write", { file_path: "/repo/a.ts" }, undefined, true)).toEqual(DENIED)
  })

  it("ワークプランがあれば通す", async () => {
    expect(await run("Edit", { file_path: "/repo/a.ts" }, undefined, false)).toEqual({})
  })

  it("無くても、Bash・Read・サブエージェントの中・メモリのパスは通す", async () => {
    expect(await run("Bash", { command: "ls" }, undefined, true)).toEqual({})
    expect(await run("Read", { file_path: "/repo/a.ts" }, undefined, true)).toEqual({})
    expect(await run("Write", { file_path: "/repo/a.ts" }, "sub-1", true)).toEqual({})
    expect(
      await run(
        "Write",
        { file_path: "/Users/x/.claude/projects/-a/memory/n.md" },
        undefined,
        true,
      ),
    ).toEqual({})
  })

  it("planMissing を渡さなければ掛けない（雑談モード）", async () => {
    expect(await runPreToolUse("Write", { file_path: "/repo/a.ts" })).toEqual({})
  })

  it("CallReview の実物で、request のあとは拒み、work_plan を受け付けたら通し、request で拒みに戻る", async () => {
    const review = createCallReview()
    const input = { file_path: "/repo/a.ts" }
    const runWith = () =>
      runPreToolUse(
        "Edit",
        input,
        undefined,
        () => false,
        () => "",
        () => {},
        {},
        createExternalToolMark(),
        () => Promise.resolve(undefined),
        review.planMissing,
      )
    review.pass(requestEvent())
    expect(await runWith()).toEqual(DENIED)

    review.judgeWorkPlan({ phases: ["架空の段A", "架空の段B"], current: 0, phaseSummary: "" })
    expect(await runWith()).toEqual({})

    review.pass(requestEvent("架空の次の依頼"))
    expect(await runWith()).toEqual(DENIED)
  })
})

describe("preToolUseHooks（Bash の command を短い出力の版へ差し替える）", () => {
  const shorten = (command: string): Promise<string | undefined> =>
    Promise.resolve(`rtk ${command}`)
  const rewriting = (toolName: string, toolInput: unknown, agentId?: string) =>
    runPreToolUse(
      toolName,
      toolInput,
      agentId,
      () => false,
      () => "",
      () => {},
      {},
      createExternalToolMark(),
      shorten,
    )

  it("メインの Bash は updatedInput で command を差し替え、permissionDecision は返さない", async () => {
    expect(await rewriting("Bash", { command: "git status" })).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: { command: "rtk git status" },
      },
    })
  })

  it("サブエージェントの中の Bash も差し替える", async () => {
    expect(await rewriting("Bash", { command: "ls" }, "sub-1")).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { command: "rtk ls" } },
    })
  })

  it("Bash 以外は差し替えず、委譲ゲートで拒むときは差し替えを返さない", async () => {
    expect(await rewriting("Read", { command: "git status" })).toEqual({})
    expect(
      await runPreToolUse(
        "Bash",
        { command: "ls" },
        undefined,
        () => true,
        () => "",
        () => {},
        {},
        createExternalToolMark(),
        shorten,
      ),
    ).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("work_plan"),
      },
    })
  })
})

describe("preToolUseHooks（外部由来の印を立てる）", () => {
  async function markAfter(toolName: string, agentId?: string, gateRaised = false) {
    const mark = createExternalToolMark()
    await runPreToolUse(
      toolName,
      {},
      agentId,
      () => gateRaised,
      () => "",
      () => {},
      {},
      mark,
    )
    return mark.allowsRemember()
  }

  it("メインでもサブエージェントの中でも、tsukumo のツール以外を見たら印を立てる", async () => {
    expect(await markAfter("WebFetch")).toBe(false)
    expect(await markAfter("Read", "sub-1")).toBe(false)
  })

  it("委譲ゲートで拒むツールでも印を立てる", async () => {
    expect(await markAfter("Bash", undefined, true)).toBe(false)
  })

  it("tsukumo のツールでは印を立てない", async () => {
    expect(await markAfter("mcp__tsukumo__speak")).toBe(true)
  })
})

describe("preToolUseHooks（メインの phase_result を拒む）", () => {
  const input = { phase: 1, count: 2, outcome: "finished" }

  it("メインの phase_result は、委譲ゲートの印が下りていても拒む", async () => {
    expect(await runPreToolUse("mcp__tsukumo__phase_result", input)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("メインは呼ばない"),
      },
    })
  })

  it("委譲先の phase_result は通す", async () => {
    expect(await runPreToolUse("mcp__tsukumo__phase_result", input, "sub-1", () => true)).toEqual(
      {},
    )
  })
})
