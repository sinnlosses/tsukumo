import { describe, expect, it } from "bun:test"

import {
  type HookCallbackMatcher,
  type HookEvent,
  type PermissionMode as SdkPermissionMode,
  type PostCompactHookInput,
  type SDKAssistantMessageError,
  type StopHookInput,
} from "@anthropic-ai/claude-agent-sdk"

import {
  buildQuerySeedOptions,
  chatSummaryHooks,
  DEFAULT_EFFORT,
  reportGateHooks,
} from "../../../src/server/adapter/sdk-driver.ts"
import { createReportGate, REPORT_GATE_REASON } from "../../../src/server/core/report-tool.ts"
import {
  type ChatSummary,
  type SessionDriverOptions,
  type SessionMode,
} from "../../../src/server/core/session-driver.ts"
import { API_ERROR_KINDS } from "../../../src/shared/api-trouble.ts"
import { MODEL_ALIASES, PERMISSION_MODES } from "../../../src/shared/command.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../src/shared/session-default.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"

// `startSession` 自体は本物の claude を子プロセスとして起こすので、ここでは呼ばない
// （docs/requirements.md 4.6 / CLAUDE.md「よく使うコマンド」）。`query()` に渡る `options` の
// うち、クロージャを含まない部分（`buildQuerySeedOptions`）だけを検査する。
const WORK_MODE: SessionMode = { kind: "work" }

const BASE_OPTIONS: SessionDriverOptions = {
  cwd: "/tmp/tsukumo-test",
  expressions: [{ name: "default", label: "通常" }],
  diaryWriter: { pack: "tsukumo", name: "つくも" },
  permissionMode: BUILTIN_SESSION_DEFAULT.permissionMode,
  model: BUILTIN_SESSION_DEFAULT.model,
  systemPromptAppend: "（テスト用の追記。会話の内容は含まない）",
  start: { kind: "new" },
  tag: "tsukumo-test",
  mode: WORK_MODE,
  inheritedEnv: { PATH: "/usr/bin", HOME: "/tmp/tsukumo-home" },
  dismissedUsageProposalKeys: () => [],
  onEvent: () => {},
}

describe("buildQuerySeedOptions", () => {
  it("同梱の既定（opus）と既定の effort（medium）を渡す", () => {
    const seed = buildQuerySeedOptions(BASE_OPTIONS)

    expect(seed.model).toBe("opus")
    expect(seed.effort).toBe(DEFAULT_EFFORT)
    expect(seed.effort).toBe("medium")
  })

  // 覚えた既定（`~/.tsukumo/state.json`）は配線層が読んで `SessionDriverOptions` に載せる
  // （`src/session-start.ts`）。ここで見るのは、その値がそのまま `query()` へ渡ること。
  it("cwd・permissionMode・model は渡された SessionDriverOptions の値をそのまま使う", () => {
    const seed = buildQuerySeedOptions({
      ...BASE_OPTIONS,
      cwd: "/tmp/tsukumo-other",
      permissionMode: "plan",
      model: "sonnet",
    })

    expect(seed.cwd).toBe("/tmp/tsukumo-other")
    expect(seed.permissionMode).toBe("plan")
    expect(seed.model).toBe("sonnet")
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
    // （`src/server/core/visible-output-nudge.ts`）。
    expect(buildQuerySeedOptions(BASE_OPTIONS).env).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/tsukumo-home",
      CLAUDE_CODE_TERMINAL_MCP_TOOLS: "mcp__tsukumo__speak",
    })
  })
})

/**
 * 雑談モードの `SessionMode`（テスト用）。**検査するのは要約の写しの口だけ**なので、残りの3つは
 * 何もしない口を置く。
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

/**
 * メモリ上の `ChatSummary`（テスト用）。`write` に渡った引数を控え、**書いたものを `read` が返す**
 * （フックは書いたあとの写しから最近の話題を読み直す）。
 */
function fakeChatSummary(): ChatSummary & { readonly writtenSummaries: () => readonly string[] } {
  const written: string[] = []
  return {
    read: () => {
      const summary = written.at(-1)
      return summary === undefined ? undefined : { summary, delivered: true }
    },
    write: (summary) => {
      written.push(summary)
    },
    markUndelivered: () => {},
    markDelivered: () => {},
    writtenSummaries: () => written,
  }
}

// フィクスチャは手で書いた架空の要約だけ（実物の会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const POST_COMPACT_INPUT: PostCompactHookInput = {
  session_id: "s-1",
  transcript_path: "/tmp/tsukumo-test/fake.jsonl",
  cwd: "/tmp/tsukumo-test",
  hook_event_name: "PostCompact",
  trigger: "manual",
  compact_summary:
    "（テスト用の架空の要約）最近読んだ本の話をした。\n<topics>\n- 架空の本の話\n</topics>",
}

describe("chatSummaryHooks", () => {
  it("仕事のとき（mode が work）は hooks を登録しない", () => {
    expect(chatSummaryHooks(WORK_MODE, () => {})).toBeUndefined()
  })

  it("雑談のとき（mode が chat）だけ PostCompact を登録し、compact_summary をそのまま write へ渡す", async () => {
    const chatSummary = fakeChatSummary()
    const hooks = chatSummaryHooks(chatMode(chatSummary), () => {})

    const callback = hooks?.PostCompact?.[0]?.hooks[0]
    expect(callback).toBeDefined()
    await callback?.(POST_COMPACT_INPUT, undefined, { signal: new AbortController().signal })

    expect(chatSummary.writtenSummaries()).toEqual([POST_COMPACT_INPUT.compact_summary])
  })

  it("写したあと、書いた写しから取り出した最近の話題を流す", async () => {
    const events: SessionEvent[] = []
    const hooks = chatSummaryHooks(chatMode(fakeChatSummary()), (event) => events.push(event))

    await hooks?.PostCompact?.[0]?.hooks[0]?.(POST_COMPACT_INPUT, undefined, {
      signal: new AbortController().signal,
    })

    expect(events).toEqual([{ kind: "chat-topics-changed", topics: ["架空の本の話"] }])
  })
})

/** `Stop` フックの入力（テスト用）。`last_assistant_message` は関所が見ないので載せない。 */
function stopInput(stopHookActive: boolean): StopHookInput {
  return {
    session_id: "s-1",
    transcript_path: "/tmp/tsukumo-test/fake.jsonl",
    cwd: "/tmp/tsukumo-test",
    hook_event_name: "Stop",
    stop_hook_active: stopHookActive,
  }
}

/** 登録された `Stop` フックを1回呼び、戻り値を返す。 */
async function runStop(
  hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined,
  stopHookActive: boolean,
): Promise<unknown> {
  const callback = hooks?.Stop?.[0]?.hooks[0]
  expect(callback).toBeDefined()
  return callback?.(stopInput(stopHookActive), undefined, { signal: new AbortController().signal })
}

describe("reportGateHooks（report の関所）", () => {
  // 本文は手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
  const LONG_BODY: SessionEvent = { kind: "utterance", text: "架空の本文の1行目\n架空の2行目" }

  it("雑談のときは登録しない", () => {
    expect(reportGateHooks(chatMode(fakeChatSummary()), createReportGate())).toBeUndefined()
  })

  it("仕事のときは常に Stop だけを登録し、SubagentStop には載せない", () => {
    const hooks = reportGateHooks(WORK_MODE, createReportGate())
    expect(Object.keys(hooks ?? {})).toEqual(["Stop"])
  })

  it("1行を超える本文で止まろうとしたら、固定の理由文で block を返す", async () => {
    const gate = createReportGate()
    gate.observe(LONG_BODY)

    expect(await runStop(reportGateHooks(WORK_MODE, gate), false)).toEqual({
      decision: "block",
      reason: REPORT_GATE_REASON,
    })
  })

  it("1行以内なら何も返さない（止まってよい）", async () => {
    const gate = createReportGate()
    gate.observe({ kind: "utterance", text: "完了" })

    expect(await runStop(reportGateHooks(WORK_MODE, gate), false)).toEqual({})
  })

  it("stop_hook_active のときは長い本文でも block しない", async () => {
    const gate = createReportGate()
    gate.observe(LONG_BODY)

    expect(await runStop(reportGateHooks(WORK_MODE, gate), true)).toEqual({})
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
})
