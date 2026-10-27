import { describe, expect, it } from "vitest"

import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import { createExternalToolMark } from "../../../../src/server/session-driver/core/external-tool-mark.ts"
import { createToolHookClock } from "../../../../src/server/session-driver/core/tool-hook-clock.ts"
import { requestEvent } from "../../../fixture/session-event.ts"
import { matcherHits, preTable, runPreToolUse } from "../../../fixture/tool-use-hook-table.ts"

describe("preToolUseHooks（matcher で当てるツールを分ける）", () => {
  const hitCount = (toolName: string) =>
    (preTable({ planMissing: () => true }).PreToolUse ?? []).filter((entry) =>
      matcherHits(entry.matcher, toolName),
    ).length

  it("Read・Grep・Glob・ToolSearch には、どの PreToolUse のフックも当たらない", () => {
    expect(hitCount("Read")).toBe(0)
    expect(hitCount("Grep")).toBe(0)
    expect(hitCount("Glob")).toBe(0)
    expect(hitCount("ToolSearch")).toBe(0)
  })

  it("phase_result 以外の tsukumo のツールにも当たらない", () => {
    expect(hitCount("mcp__tsukumo__speak")).toBe(0)
    expect(hitCount("mcp__tsukumo__report")).toBe(0)
    expect(hitCount("mcp__tsukumo__phase_result")).toBe(1)
  })

  it("Bash・Agent・Edit・Write には委譲ゲートとそれぞれのフックが当たり、ほかの外部のツールには委譲ゲートだけが当たる", () => {
    expect(hitCount("Bash")).toBe(2)
    expect(hitCount("Agent")).toBe(2)
    expect(hitCount("Edit")).toBe(2)
    expect(hitCount("Write")).toBe(2)
    expect(hitCount("WebFetch")).toBe(1)
    expect(hitCount("mcp__other__tool")).toBe(1)
    expect(hitCount("ReadMcpResource")).toBe(1)
  })

  it("委譲ゲートの matcher は、正規表現として組めて judgeToolAgainstGate と同じ名前に当たる", async () => {
    const raised = { gateRaised: () => true }
    expect(await runPreToolUse("WebFetch", {}, undefined, raised)).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    })
    expect(await runPreToolUse("Read", {}, undefined, raised)).toEqual({})
  })

  it("Read・Grep では、外部由来の印も所要の控えも PreToolUse では触らない", async () => {
    const mark = createExternalToolMark()
    const clock = createToolHookClock(() => 0)
    await runPreToolUse("Read", {}, undefined, { externalToolMark: mark, hookClock: clock })
    await runPreToolUse("Grep", {}, undefined, { externalToolMark: mark, hookClock: clock })
    expect(mark.allowsRemember()).toBe(true)
    expect(clock.finished("t-1", 0)).toEqual({ kind: "unseen" })
  })

  it("matcher の当て方の写しは、`,` と空白で区切った列も完全一致の列として扱う", () => {
    expect(matcherHits("Edit, Write", "Write")).toBe(true)
    expect(matcherHits("Edit, Write", "Edit")).toBe(true)
    expect(matcherHits("Edit, Write", "NotebookEdit")).toBe(false)
  })

  it("planMissing を渡さなければ Edit|Write のフックを登録しない", () => {
    expect((preTable({}).PreToolUse ?? []).some((entry) => entry.matcher === "Edit|Write")).toBe(
      false,
    )
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
  const raised = { gateRaised: () => true }

  it("印が立っているあいだ、メインの作業のツールと Agent は拒む", async () => {
    expect(await runPreToolUse("Bash", { command: "ls" }, undefined, raised)).toEqual(DENIED)
    expect(await runPreToolUse("Agent", { prompt: "手順" }, undefined, raised)).toEqual(DENIED)
  })

  it("印が立っていても、読み取り・tsukumo のツール・サブエージェントの中の呼び出しは通す", async () => {
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
      await runPreToolUse("Bash", {}, undefined, {
        gateRaised: review.gateRaised,
        bandPosition: review.bandPosition,
      }),
    ).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("帯の今の段は 本 1/2 架空の段A。"),
      },
    })
    review.judgeWorkPlan({ ...plan, current: 1, phaseSummary: "架空のまとめ。" })
    expect(await runPreToolUse("Bash", {}, undefined, { gateRaised: review.gateRaised })).toEqual(
      {},
    )
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
  ) => runPreToolUse(toolName, toolInput, agentId, { planMissing: () => missing })

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
    const runWith = () =>
      runPreToolUse("Edit", { file_path: "/repo/a.ts" }, undefined, {
        planMissing: review.planMissing,
      })
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
    runPreToolUse(toolName, toolInput, agentId, { rewriteBash: shorten })

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

  it("Bash 以外は差し替えず、委譲ゲートで拒むときは拒否が勝つ", async () => {
    expect(await rewriting("Read", { command: "git status" })).toEqual({})
    expect(
      await runPreToolUse("Bash", { command: "ls" }, undefined, {
        gateRaised: () => true,
        rewriteBash: shorten,
      }),
    ).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("work_plan"),
      },
    })
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
    expect(
      await runPreToolUse("mcp__tsukumo__phase_result", input, "sub-1", {
        gateRaised: () => true,
      }),
    ).toEqual({})
  })
})
