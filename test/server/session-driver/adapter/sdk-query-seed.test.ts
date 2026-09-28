import type { HookCallbackMatcher, HookEvent, StopHookInput } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import {
  createReportGate,
  REPORT_GATE_REASON,
} from "../../../../src/server/report/core/report-tool.ts"
import {
  buildQuerySeedOptions,
  stopHooks,
} from "../../../../src/server/session-driver/adapter/sdk-query-seed.ts"
import type {
  ChatSummary,
  SessionDriverOptions,
  SessionMode,
} from "../../../../src/server/session-driver/core/session-driver.ts"
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
  dismissedUsageProposalKeys: () => [],
  onEvent: () => {},
}

describe("buildQuerySeedOptions", () => {
  it("同梱の既定（opus・medium）を渡す", () => {
    const seed = buildQuerySeedOptions(BASE_OPTIONS)

    expect(seed.model).toBe("opus")
    expect(seed.effort).toBe("medium")
  })

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

  it("settings.language を japanese 固定で渡す", () => {
    expect(buildQuerySeedOptions(BASE_OPTIONS).settings).toEqual({ language: "japanese" })
  })

  it("引き継いだ環境変数に CLAUDE_CODE_TERMINAL_MCP_TOOLS=mcp__tsukumo__speak を足して子プロセスへ渡す", () => {
    // SDK の `env` は `process.env` と混ぜずに丸ごと置き換えるので、引き継ぎが落ちていないことも見る
    // （`childProcessEnv`）。
    expect(buildQuerySeedOptions(BASE_OPTIONS).env).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/tsukumo-home",
      CLAUDE_CODE_TERMINAL_MCP_TOOLS: "mcp__tsukumo__speak",
    })
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

describe("stopHooks（report の関所と effort の読み取り）", () => {
  const LONG_BODY: SessionEvent = { kind: "utterance", text: "架空の本文の1行目\n架空の2行目" }

  it("仕事でも雑談でも Stop だけを登録し、SubagentStop には載せない", () => {
    expect(Object.keys(stopHooks(WORK_MODE, createReportGate(), () => {}))).toEqual(["Stop"])
    expect(
      Object.keys(stopHooks(chatMode(fixedChatSummary(undefined)), createReportGate(), () => {})),
    ).toEqual(["Stop"])
  })

  it("1行を超える本文で止まろうとしたら、固定の理由文で block を返す（仕事のときだけ）", async () => {
    const gate = createReportGate()
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
    const gate = createReportGate()
    gate.observe({ kind: "utterance", text: "完了" })

    expect(
      await runStop(
        stopHooks(WORK_MODE, gate, () => {}),
        false,
      ),
    ).toEqual({})
  })

  it("stop_hook_active のときは長い本文でも block しない", async () => {
    const gate = createReportGate()
    gate.observe(LONG_BODY)

    expect(
      await runStop(
        stopHooks(WORK_MODE, gate, () => {}),
        true,
      ),
    ).toEqual({})
  })

  it("雑談のときは長い本文でも block しない（関所は仕事だけ）", async () => {
    const gate = createReportGate()
    gate.observe(LONG_BODY)

    expect(
      await runStop(
        stopHooks(chatMode(fixedChatSummary(undefined)), gate, () => {}),
        false,
      ),
    ).toEqual({})
  })

  it("effort.level が読めたら effort-changed を流す（仕事でも雑談でも）", async () => {
    const workEvents: SessionEvent[] = []
    await runStop(
      stopHooks(WORK_MODE, createReportGate(), (event) => workEvents.push(event)),
      false,
      "high",
    )
    expect(workEvents).toEqual([{ kind: "effort-changed", effort: "high" }])

    const chatEvents: SessionEvent[] = []
    await runStop(
      stopHooks(chatMode(fixedChatSummary(undefined)), createReportGate(), (event) =>
        chatEvents.push(event),
      ),
      false,
      "low",
    )
    expect(chatEvents).toEqual([{ kind: "effort-changed", effort: "low" }])
  })

  it("effort が無い・知らない段のときは effort-changed を流さない", async () => {
    const withoutEffort: SessionEvent[] = []
    await runStop(
      stopHooks(WORK_MODE, createReportGate(), (event) => withoutEffort.push(event)),
      false,
    )
    expect(withoutEffort).toEqual([])

    const unknownLevel: SessionEvent[] = []
    await runStop(
      stopHooks(WORK_MODE, createReportGate(), (event) => unknownLevel.push(event)),
      false,
      "未来の段",
    )
    expect(unknownLevel).toEqual([])
  })
})
