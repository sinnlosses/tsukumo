import { describe, expect, it } from "vitest"

import { createExternalToolMark } from "../../../../src/server/session-driver/core/external-tool-mark.ts"
import {
  createToolHookClock,
  type ToolHookDurationLap,
} from "../../../../src/server/session-driver/core/tool-hook-clock.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { runPostToolUse, runPreToolUse } from "../../../fixture/tool-use-hook-table.ts"

describe("postToolUseHooks が見届けた設定を流す", () => {
  it("メインの呼び出しでは effort.level と permission_mode を setting-confirmed にする", async () => {
    const events: SessionEvent[] = []
    await runPostToolUse(
      "Read",
      undefined,
      { onEvent: (event) => events.push(event) },
      { effort: { level: "high" }, permission_mode: "plan" },
    )
    expect(events).toEqual([
      { kind: "setting-confirmed", setting: "effort", value: "high" },
      { kind: "setting-confirmed", setting: "permissionMode", value: "plan" },
    ])
  })

  it("effort が無い入力では effort を出さず、サブエージェントの中の呼び出しは何も出さない", async () => {
    const mainEvents: SessionEvent[] = []
    await runPostToolUse(
      "Read",
      undefined,
      { onEvent: (event) => mainEvents.push(event) },
      { permission_mode: "default" },
    )
    expect(mainEvents).toEqual([
      { kind: "setting-confirmed", setting: "permissionMode", value: "default" },
    ])

    const subEvents: SessionEvent[] = []
    await runPostToolUse(
      "Read",
      "sub-1",
      { onEvent: (event) => subEvents.push(event) },
      { effort: { level: "high" }, permission_mode: "plan" },
    )
    expect(subEvents).toEqual([])
  })
})

describe("postToolUseHooks（外部由来の印を立てる）", () => {
  async function markAfter(toolName: string, agentId: string | undefined, failed: boolean) {
    const mark = createExternalToolMark()
    await runPostToolUse(toolName, agentId, { externalToolMark: mark }, {}, failed)
    return mark.allowsRemember()
  }

  it("メインでもサブエージェントの中でも、tsukumo のツール以外の結果を受けたら印を立てる", async () => {
    expect(await markAfter("WebFetch", undefined, false)).toBe(false)
    expect(await markAfter("Read", "sub-1", false)).toBe(false)
  })

  it("サブエージェントの中の Read・Grep・Glob・ToolSearch・Bash の結果で印を立てる", async () => {
    for (const toolName of ["Read", "Grep", "Glob", "ToolSearch", "Bash"]) {
      expect(await markAfter(toolName, "sub-1", false)).toBe(false)
    }
  })

  it("ツールが失敗した結果（PostToolUseFailure）でも、メインでもサブエージェントの中でも印を立てる", async () => {
    for (const toolName of ["Read", "Grep", "Glob", "ToolSearch", "Bash"]) {
      expect(await markAfter(toolName, "sub-1", true)).toBe(false)
    }
    expect(await markAfter("WebFetch", undefined, true)).toBe(false)
  })

  it("tsukumo のツールの結果では印を立てない", async () => {
    expect(await markAfter("mcp__tsukumo__speak", undefined, false)).toBe(true)
    expect(await markAfter("mcp__tsukumo__speak", undefined, true)).toBe(true)
  })

  it("委譲ゲートが当たるツールは、拒まれて結果が来なくても PreToolUse で印を立てる", async () => {
    const mark = createExternalToolMark()
    await runPreToolUse("Bash", {}, undefined, { gateRaised: () => true, externalToolMark: mark })
    expect(mark.allowsRemember()).toBe(false)
  })
})

describe("postToolUseHooks（PreToolUse からツールが走り始めるまでの所要を残す）", () => {
  it("委譲ゲートが当たったツールの結果で、ツールの語・所要のミリ秒・フックの名前だけを1件渡す", async () => {
    const clock = createToolHookClock(clockAt([1000, 1500]))
    const footprints: ToolHookDurationLap[] = []
    await runPreToolUse("Bash", { command: "架空のコマンド" }, undefined, { hookClock: clock })
    await runPostToolUse(
      "Bash",
      undefined,
      { hookClock: clock, diagnose: (lap) => footprints.push(lap) },
      { duration_ms: 300 },
    )
    expect(footprints).toEqual([
      {
        flow: "tool-hook-duration",
        tool: "Bash",
        inSubagent: false,
        hook: "PostToolUse",
        beforeToolMs: 200,
        toolMs: 300,
      },
    ])
  })

  it("失敗した結果では PostToolUseFailure として渡し、委譲先の中の呼び出しと MCP の名前は語に写す", async () => {
    const clock = createToolHookClock(clockAt([0, 50]))
    const footprints: ToolHookDurationLap[] = []
    await runPreToolUse("mcp__other__tool", {}, "sub-1", { hookClock: clock })
    await runPostToolUse(
      "mcp__other__tool",
      "sub-1",
      { hookClock: clock, diagnose: (footprint) => footprints.push(footprint) },
      { duration_ms: 10 },
      true,
    )
    expect(footprints).toEqual([
      expect.objectContaining({
        tool: "mcp",
        inSubagent: true,
        hook: "PostToolUseFailure",
        beforeToolMs: 40,
        toolMs: 10,
      }),
    ])
  })

  it("PreToolUse のフックが当たらない Read と、duration_ms の無い結果では渡さない", async () => {
    const clock = createToolHookClock(() => 0)
    const footprints: ToolHookDurationLap[] = []
    const diagnose = (footprint: ToolHookDurationLap) => footprints.push(footprint)
    await runPreToolUse("Read", {}, undefined, { hookClock: clock })
    await runPostToolUse("Read", undefined, { hookClock: clock, diagnose }, { duration_ms: 5 })
    await runPreToolUse("Bash", {}, undefined, { hookClock: clock })
    await runPostToolUse("Bash", undefined, { hookClock: clock, diagnose })
    expect(footprints).toEqual([])
  })
})

/** 呼ばれるたびに並びの次の時刻を返す時計。尽きたら最後の時刻を返し続ける。 */
function clockAt(times: readonly number[]): () => number {
  let index = 0
  return () => {
    const time = times[Math.min(index, times.length - 1)] ?? 0
    index += 1
    return time
  }
}
