import { describe, expect, it } from "bun:test"

import {
  type EffortLevel as SdkEffortLevel,
  type HookCallbackMatcher,
  type HookEvent,
  type PermissionMode as SdkPermissionMode,
  type SDKAssistantMessageError,
  type StopHookInput,
} from "@anthropic-ai/claude-agent-sdk"

import {
  createReportGate,
  REPORT_GATE_AFTER_REPORT_REASON,
  REPORT_GATE_REASON,
} from "../../../../src/server/report/core/report-tool.ts"
import {
  buildQuerySeedOptions,
  stopHooks,
} from "../../../../src/server/session-driver/adapter/sdk-driver.ts"
import {
  type ChatSummary,
  type SessionDriverOptions,
  type SessionMode,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { API_ERROR_KINDS } from "../../../../src/shared/api-trouble.ts"
import { EFFORT_LEVELS, MODEL_ALIASES, PERMISSION_MODES } from "../../../../src/shared/command.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../src/shared/session-default.ts"
import { type SessionEvent } from "../../../../src/shared/session-event.ts"

// `startSession` 自体は本物の claude を子プロセスとして起こすので、ここでは呼ばない
// （docs/requirements.md 4.6 / CLAUDE.md「よく使うコマンド」）。`query()` に渡る `options` の
// うち、クロージャを含まない部分（`buildQuerySeedOptions`）だけを検査する。
const WORK_MODE: SessionMode = { kind: "work" }

const BASE_OPTIONS: SessionDriverOptions = {
  cwd: "/tmp/tsukumo-test",
  expressions: [{ name: "default", label: "通常" }],
  permissionMode: BUILTIN_SESSION_DEFAULT.permissionMode,
  model: BUILTIN_SESSION_DEFAULT.model,
  effort: BUILTIN_SESSION_DEFAULT.effort,
  systemPromptAppend: "（テスト用の追記。会話の内容は含まない）",
  start: { kind: "new" },
  tag: "tsukumo-test",
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
  // （`src/session-start.ts`）。ここで見るのは、その値がそのまま `query()` へ渡ること。
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
    // （`src/server/session-driver/core/visible-output-nudge.ts`）。
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
    chatKeep: { keep: () => {} },
    chatRecall: { index: () => {}, recall: () => ({ kind: "not-found" }) },
  }
}

/** 何もしない `ChatSummary`（`Stop` フックは写しに触らない）。 */
function fakeChatSummary(): ChatSummary {
  return {
    read: () => undefined,
    write: () => {},
    markUndelivered: () => {},
    markDelivered: () => {},
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
  // 本文は手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
  const LONG_BODY: SessionEvent = { kind: "utterance", text: "架空の本文の1行目\n架空の2行目" }

  it("仕事でも雑談でも Stop だけを登録し、SubagentStop には載せない", () => {
    expect(Object.keys(stopHooks(WORK_MODE, createReportGate(), () => {}))).toEqual(["Stop"])
    expect(
      Object.keys(stopHooks(chatMode(fakeChatSummary()), createReportGate(), () => {})),
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

  it("report の済んだターンなら、もう画面に出ていると伝える理由で block を返す", async () => {
    const gate = createReportGate()
    gate.observe({
      kind: "report",
      toolUseId: "toolu_r1",
      conclusion: "架空の結論",
      body: "",
      favor: "",
    })
    gate.observe(LONG_BODY)

    expect(
      await runStop(
        stopHooks(WORK_MODE, gate, () => {}),
        false,
      ),
    ).toEqual({
      decision: "block",
      reason: REPORT_GATE_AFTER_REPORT_REASON,
    })
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
        stopHooks(chatMode(fakeChatSummary()), gate, () => {}),
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
      stopHooks(chatMode(fakeChatSummary()), createReportGate(), (event) => chatEvents.push(event)),
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

describe("shared の値の一覧と SDK の型", () => {
  it("PERMISSION_MODES はすべて SDK の PermissionMode として渡せる値", () => {
    // 代入できること自体が型の検査。**SDK 側にはこれ以外の値もある**（`dontAsk`。画面には
    // 出さないので shared の一覧には入れていない）ので、確かめるのはこの向きだけ。
    const asSdk: readonly SdkPermissionMode[] = PERMISSION_MODES

    expect([...asSdk].sort()).toEqual([
      "acceptEdits",
      "auto",
      "bypassPermissions",
      "default",
      "plan",
    ])
  })

  it("API_ERROR_KINDS は SDK の SDKAssistantMessageError と同じ綴りの集まり", () => {
    // 片方の向きは代入で、もう片方の向きは全域の表（`satisfies Record<...>`）で確かめる。
    // SDK に綴りが増えたら表の `satisfies` が型で落ち、shared に足し忘れたと分かる。
    const asSdk: readonly SDKAssistantMessageError[] = API_ERROR_KINDS
    const everySdkError = {
      authentication_failed: true,
      oauth_org_not_allowed: true,
      account_on_hold: true,
      verification_required: true,
      billing_error: true,
      rate_limit: true,
      overloaded: true,
      invalid_request: true,
      model_not_found: true,
      server_error: true,
      unknown: true,
      max_output_tokens: true,
      cloud_credential_error: true,
    } satisfies Record<SDKAssistantMessageError, true>

    expect(Object.keys(everySdkError).toSorted()).toEqual(asSdk.toSorted())
  })

  it("MODEL_ALIASES は既定のモデルを含む4語", () => {
    expect(MODEL_ALIASES).toEqual(["opus", "sonnet", "haiku", "fable"])
  })

  it("EFFORT_LEVELS はすべて SDK の EffortLevel として渡せる値", () => {
    // 代入できること自体が型の検査（PERMISSION_MODES と同じやり方）。
    const asSdk: readonly SdkEffortLevel[] = EFFORT_LEVELS

    expect([...asSdk].sort()).toEqual(["high", "low", "max", "medium", "xhigh"])
  })
})
