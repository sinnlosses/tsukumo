import { join } from "node:path"

import type {
  BaseHookInput,
  HookCallbackMatcher,
  HookEvent,
  StopHookInput,
} from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import { tsukumoHomeDir } from "../../../../src/server/adapter/tsukumo-home.ts"
import {
  createReportGate,
  REPORT_GATE_REASON,
} from "../../../../src/server/report/core/report-tool.ts"
import {
  buildQuerySeedOptions,
  handbackNoteHooks,
  preToolUseHooks,
  stopHooks,
} from "../../../../src/server/session-driver/adapter/sdk-query-seed.ts"
import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import type {
  ChatSummary,
  SessionDriverOptions,
  SessionMode,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { parseDelegateReturn } from "../../../../src/shared/session/delegate-return.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../src/shared/session/session-default.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { fixedChatSummary } from "../../../fixture/chat.ts"

// `startSdkDriver` 自体は本物の claude を子プロセスとして起こすので、ここでは呼ばない
// （docs/requirements.md「起動と設定」 / CLAUDE.md「よく使うコマンド」）。`query()` に渡る `options` の
// うち、クロージャを含まない部分（`buildQuerySeedOptions`）だけを検査する。
const WORK_MODE: SessionMode = {
  kind: "work",
  chatRecall: {
    recallList: () => ({ kind: "not-found" }),
    recallEpisode: () => ({ kind: "not-found" }),
    finishTurn: () => {},
  },
}

const BASE_OPTIONS: SessionDriverOptions = {
  cwd: "/tmp/tsukumo-test",
  expressions: [{ name: "default", label: "通常" }],
  permissionMode: BUILTIN_SESSION_DEFAULT.permissionMode,
  model: BUILTIN_SESSION_DEFAULT.model,
  effort: BUILTIN_SESSION_DEFAULT.effort,
  systemPromptAppend: "（テスト用の追記。会話の内容は含まない）",
  start: { kind: "new" },
  tag: "tsukumo-test",
  onSessionMarked: () => {},
  mode: WORK_MODE,
  inheritedEnv: { PATH: "/usr/bin", HOME: "/tmp/tsukumo-home" },
  claudeConfigDir: undefined,
  mountWorkflowPlugin: true,
  onEvent: () => {},
  reportFailure: () => {},
  now: () => 0,
  reportPromptDelay: () => {},
  reportUsageFailure: () => {},
}

describe("buildQuerySeedOptions", () => {
  // 覚えた既定（`~/.tsukumo/state.json`）は配線層が読んで `SessionDriverOptions` に載せる
  // （`startSession`）。ここで見るのは、その値がそのまま `query()` へ渡ること。
  it("cwd・permissionMode・model・effort は渡された SessionDriverOptions の値をそのまま使う", () => {
    const seed = buildQuerySeedOptions({
      ...BASE_OPTIONS,
      cwd: "/tmp/tsukumo-other",
      permissionMode: "plan",
      model: "sonnet",
      effort: "high",
    })

    expect(seed.cwd).toBe("/tmp/tsukumo-other")
    expect(seed.permissionMode).toBe("plan")
    expect(seed.model).toBe("sonnet")
    expect(seed.effort).toBe("high")
  })

  // 対応しないモデル（haiku）でも渡すかどうかをここで出し分けない（`query()` 自身の判断に任せる）。
  it("対応しないモデルの effort でも渡す（渡すかどうかをモデルごとに出し分けない）", () => {
    const seed = buildQuerySeedOptions({ ...BASE_OPTIONS, model: "haiku", effort: "high" })

    expect(seed.model).toBe("haiku")
    expect(seed.effort).toBe("high")
  })

  it("続きから始めるセッションのIDを resume として渡す（新規のときは undefined）", () => {
    expect(buildQuerySeedOptions(BASE_OPTIONS).resume).toBeUndefined()
    expect(
      buildQuerySeedOptions({ ...BASE_OPTIONS, start: { kind: "resume", sessionId: "s-1" } })
        .resume,
    ).toBe("s-1")
  })

  it("キャラクターパックの置き場だけを cwd の外の読める場所として渡す", () => {
    expect(buildQuerySeedOptions(BASE_OPTIONS).additionalDirectories).toEqual([
      join(tsukumoHomeDir(), "characters"),
    ])
  })

  it("settings.language を japanese 固定で渡す", () => {
    expect(buildQuerySeedOptions(BASE_OPTIONS).settings).toEqual({ language: "japanese" })
  })

  it("引き継いだ環境変数に本体の催促を止める2つの変数を足して子プロセスへ渡す", () => {
    // SDK の `env` は `process.env` と混ぜずに丸ごと置き換えるので、引き継ぎが落ちていないことも見る
    // （`childProcessEnv`）。
    expect(buildQuerySeedOptions(BASE_OPTIONS).env).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/tsukumo-home",
      CLAUDE_CODE_TERMINAL_MCP_TOOLS: "mcp__tsukumo__speak",
      CLAUDE_CODE_SILENT_TURN_REMINDER: "0",
    })
  })

  it("取り込んだ tsukumo-plugins は mountWorkflowPlugin のときだけ plugins に載せる", () => {
    const mounted = buildQuerySeedOptions(BASE_OPTIONS).plugins.map((plugin) => plugin.path)
    const unmounted = buildQuerySeedOptions({
      ...BASE_OPTIONS,
      mountWorkflowPlugin: false,
    }).plugins.map((plugin) => plugin.path)

    expect(mounted).toHaveLength(2)
    expect(mounted[1]).toMatch(/vendor\/tsukumo-plugins$/)
    expect(unmounted).toEqual([mounted[0]])
  })
})

/**
 * 雑談モードの `SessionMode`（テスト用）。どの口も何もしない。
 */
function chatMode(chatSummary: ChatSummary): SessionMode {
  return {
    kind: "chat",
    personaMemory: { remember: () => {}, forget: () => {}, finishTurn: () => {} },
    chatSummary,
    chatRecall: {
      recallList: () => ({ kind: "not-found" }),
      recallEpisode: () => ({ kind: "not-found" }),
      finishTurn: () => {},
    },
  }
}

/** `Stop` フックの入力（テスト用）。`last_assistant_message` は関所が見ないので載せない。 */
function stopInput(stopHookActive: boolean, effortLevel?: string): StopHookInput {
  return {
    session_id: "s-1",
    transcript_path: "/tmp/tsukumo-test/fake.jsonl",
    cwd: "/tmp/tsukumo-test",
    hook_event_name: "Stop",
    stop_hook_active: stopHookActive,
    ...(effortLevel === undefined ? {} : { effort: { level: effortLevel } }),
  }
}

/** 登録された `Stop` フックを1回呼び、戻り値を返す。 */
async function runStop(
  hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined,
  stopHookActive: boolean,
  effortLevel?: string,
): Promise<unknown> {
  const callback = hooks?.Stop?.[0]?.hooks[0]
  expect(callback).toBeDefined()
  return callback?.(stopInput(stopHookActive, effortLevel), undefined, {
    signal: new AbortController().signal,
  })
}

async function runPreToolUse(
  toolName: string,
  toolInput: unknown,
  agentId?: string,
  gateRaised: () => boolean = () => false,
  bandPosition: () => string = () => "",
  onEvent: (event: SessionEvent) => void = () => {},
  settings: Pick<BaseHookInput, "effort" | "permission_mode"> = {},
): Promise<unknown> {
  const callback = preToolUseHooks(gateRaised, bandPosition, onEvent).PreToolUse?.[0]?.hooks[0]
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

describe("preToolUseHooks（Agent を背景に固定し、関門で作業のツールを拒む）", () => {
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
    review.pass({ kind: "request", text: "架空の依頼", images: [] })
    review.judgeWorkPlan(plan)
    review.pass({
      kind: "delegate-returned",
      handback: parseDelegateReturn("段 1/2 | 架空の返却。"),
    })

    expect(
      await runPreToolUse("Bash", {}, undefined, review.gateRaised, review.bandPosition),
    ).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("帯の今の段は 2/2 架空の段B。"),
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

  it("サブエージェント内の呼び出しと、すでに背景の呼び出しは何も返さない", async () => {
    expect(await runPreToolUse("Agent", { prompt: "手順" }, "sub-1")).toEqual({})
    expect(await runPreToolUse("Agent", { run_in_background: true })).toEqual({})
  })
})

describe("handbackNoteHooks（返却を運ぶ入力に注記を添える）", () => {
  const HANDBACK_PROMPT =
    '<agent-message from="架空の委譲先">\n[架空の前置き]\n  段 1/2 | 架空の返却。'

  async function runUserPromptSubmit(
    takeHandbackNote: () => string,
    prompt: string,
    agentId?: string,
  ): Promise<unknown> {
    const callback = handbackNoteHooks(takeHandbackNote).UserPromptSubmit?.[0]?.hooks[0]
    expect(callback).toBeDefined()
    return callback?.(
      {
        session_id: "s-1",
        transcript_path: "/tmp/tsukumo-test/fake.jsonl",
        cwd: "/tmp/tsukumo-test",
        hook_event_name: "UserPromptSubmit",
        prompt,
        ...(agentId === undefined ? {} : { agent_id: agentId }),
      },
      undefined,
      { signal: new AbortController().signal },
    )
  }

  const startedReview = () => {
    const review = createCallReview()
    review.pass({ kind: "request", text: "架空の依頼", images: [] })
    review.judgeWorkPlan({
      phases: ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"],
      current: 1,
      phaseSummary: "架空のまとめ。",
      delegatedRange: { first: 1, count: 2 },
    })
    review.pass({
      kind: "delegate-returned",
      handback: parseDelegateReturn("段 1/2 | 架空の返却。"),
    })
    return review
  }

  it("メインの返却の入力に、済んだ帯の段と帯の位置の注記を additionalContext で1回だけ添える", async () => {
    const review = startedReview()

    expect(await runUserPromptSubmit(review.takeHandbackNote, HANDBACK_PROMPT)).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          "tsukumo の注記（委譲先の返却の本文ではない）:返却 `段 1/2` で帯の 1/2 架空の実装A が済んだ。" +
          "帯の今の段は 2/2 架空の実装B。帯の段の番号は委譲先の段の番号と同じで、範囲の外の段（計画・受け入れ）は番号を持たず名前で言う。",
      },
    })
    expect(await runUserPromptSubmit(review.takeHandbackNote, HANDBACK_PROMPT)).toEqual({})
  })

  it("返却でない入力とサブエージェントの中の入力では何も返さず、注記を取り出さない", async () => {
    const review = startedReview()

    expect(await runUserPromptSubmit(review.takeHandbackNote, "架空の依頼")).toEqual({})
    expect(await runUserPromptSubmit(review.takeHandbackNote, HANDBACK_PROMPT, "agent-1")).toEqual(
      {},
    )
    expect(review.takeHandbackNote()).toContain("返却 `段 1/2`")
  })
})

describe("stopHooks（report の関所と effort の読み取り）", () => {
  const LONG_BODY: SessionEvent = { kind: "utterance", text: "架空の本文の1行目\n架空の2行目" }

  it("仕事でも雑談でも Stop だけを登録し、SubagentStop には載せない", () => {
    expect(
      Object.keys(
        stopHooks(
          WORK_MODE,
          createReportGate(() => false),
          () => {},
        ),
      ),
    ).toEqual(["Stop"])
    expect(
      Object.keys(
        stopHooks(
          chatMode(fixedChatSummary(undefined)),
          createReportGate(() => false),
          () => {},
        ),
      ),
    ).toEqual(["Stop"])
  })

  it("1行を超える本文で止まろうとしたら、固定の理由文で block を返す（仕事のときだけ）", async () => {
    const gate = createReportGate(() => false)
    gate.observe(LONG_BODY)

    expect(
      await runStop(
        stopHooks(WORK_MODE, gate, () => {}),
        false,
      ),
    ).toEqual({
      decision: "block",
      reason: REPORT_GATE_REASON,
    })
  })

  it("1行以内なら何も返さない（止まってよい）", async () => {
    const gate = createReportGate(() => false)
    gate.observe({ kind: "utterance", text: "完了" })

    expect(
      await runStop(
        stopHooks(WORK_MODE, gate, () => {}),
        false,
      ),
    ).toEqual({})
  })

  it("stop_hook_active のときは長い本文でも block しない", async () => {
    const gate = createReportGate(() => false)
    gate.observe(LONG_BODY)

    expect(
      await runStop(
        stopHooks(WORK_MODE, gate, () => {}),
        true,
      ),
    ).toEqual({})
  })

  it("雑談のときは長い本文でも block しない（関所は仕事だけ）", async () => {
    const gate = createReportGate(() => false)
    gate.observe(LONG_BODY)

    expect(
      await runStop(
        stopHooks(chatMode(fixedChatSummary(undefined)), gate, () => {}),
        false,
      ),
    ).toEqual({})
  })

  it("effort.level が読めたら setting-confirmed（effort）を流す（仕事でも雑談でも）", async () => {
    const workEvents: SessionEvent[] = []
    await runStop(
      stopHooks(
        WORK_MODE,
        createReportGate(() => false),
        (event) => workEvents.push(event),
      ),
      false,
      "high",
    )
    expect(workEvents).toEqual([{ kind: "setting-confirmed", setting: "effort", value: "high" }])

    const chatEvents: SessionEvent[] = []
    await runStop(
      stopHooks(
        chatMode(fixedChatSummary(undefined)),
        createReportGate(() => false),
        (event) => chatEvents.push(event),
      ),
      false,
      "low",
    )
    expect(chatEvents).toEqual([{ kind: "setting-confirmed", setting: "effort", value: "low" }])
  })

  it("effort が無い・知らない段のときは setting-confirmed を流さない", async () => {
    const withoutEffort: SessionEvent[] = []
    await runStop(
      stopHooks(
        WORK_MODE,
        createReportGate(() => false),
        (event) => withoutEffort.push(event),
      ),
      false,
    )
    expect(withoutEffort).toEqual([])

    const unknownLevel: SessionEvent[] = []
    await runStop(
      stopHooks(
        WORK_MODE,
        createReportGate(() => false),
        (event) => unknownLevel.push(event),
      ),
      false,
      "未来の段",
    )
    expect(unknownLevel).toEqual([])
  })
})
