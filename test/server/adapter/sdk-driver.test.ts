import { describe, expect, it } from "bun:test"

import {
  type PermissionMode as SdkPermissionMode,
  type PostCompactHookInput,
} from "@anthropic-ai/claude-agent-sdk"

import {
  buildQuerySeedOptions,
  chatSummaryHooks,
  DEFAULT_EFFORT,
} from "../../../src/server/adapter/sdk-driver.ts"
import {
  type ChatSummary,
  DEFAULT_MODEL,
  DEFAULT_PERMISSION_MODE,
  type SessionDriverOptions,
  type SessionMode,
} from "../../../src/server/core/session-driver.ts"
import { MODEL_ALIASES, PERMISSION_MODES } from "../../../src/shared/command.ts"

// `startSession` 自体は本物の claude を子プロセスとして起こすので、ここでは呼ばない
// （docs/requirements.md 4.6 / CLAUDE.md「よく使うコマンド」）。`query()` に渡る `options` の
// うち、クロージャを含まない部分（`buildQuerySeedOptions`）だけを検査する。
const WORK_MODE: SessionMode = { kind: "work" }

const BASE_OPTIONS: SessionDriverOptions = {
  cwd: "/tmp/tsukumo-test",
  expressions: [{ name: "default", label: "通常" }],
  permissionMode: DEFAULT_PERMISSION_MODE,
  systemPromptAppend: "（テスト用の追記。会話の内容は含まない）",
  start: { kind: "new" },
  tag: "tsukumo-test",
  mode: WORK_MODE,
  onEvent: () => {},
}

describe("buildQuerySeedOptions", () => {
  it("既定のモデル（opus）と既定の effort（high）を渡す", () => {
    const seed = buildQuerySeedOptions(BASE_OPTIONS)

    expect(seed.model).toBe(DEFAULT_MODEL)
    expect(seed.model).toBe("opus")
    expect(seed.effort).toBe(DEFAULT_EFFORT)
    expect(seed.effort).toBe("high")
  })

  it("cwd・permissionMode は渡された SessionDriverOptions の値をそのまま使う", () => {
    const seed = buildQuerySeedOptions({
      ...BASE_OPTIONS,
      cwd: "/tmp/tsukumo-other",
      permissionMode: "plan",
    })

    expect(seed.cwd).toBe("/tmp/tsukumo-other")
    expect(seed.permissionMode).toBe("plan")
  })

  it("続きから始めるセッションのIDを resume として渡す（新規のときは undefined）", () => {
    expect(buildQuerySeedOptions(BASE_OPTIONS).resume).toBeUndefined()
    expect(
      buildQuerySeedOptions({ ...BASE_OPTIONS, start: { kind: "resume", sessionId: "s-1" } })
        .resume,
    ).toBe("s-1")
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

/** メモリ上の `ChatSummary`（テスト用）。`write` に渡った引数を控える。 */
function fakeChatSummary(): ChatSummary & { readonly writtenSummaries: () => readonly string[] } {
  const written: string[] = []
  return {
    read: () => undefined,
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
  compact_summary: "（テスト用の架空の要約）最近読んだ本の話をした。",
}

describe("chatSummaryHooks", () => {
  it("仕事のとき（mode が work）は hooks を登録しない", () => {
    expect(chatSummaryHooks(WORK_MODE)).toBeUndefined()
  })

  it("雑談のとき（mode が chat）だけ PostCompact を登録し、compact_summary をそのまま write へ渡す", async () => {
    const chatSummary = fakeChatSummary()
    const hooks = chatSummaryHooks(chatMode(chatSummary))

    const callback = hooks?.PostCompact?.[0]?.hooks[0]
    expect(callback).toBeDefined()
    await callback?.(POST_COMPACT_INPUT, undefined, { signal: new AbortController().signal })

    expect(chatSummary.writtenSummaries()).toEqual([POST_COMPACT_INPUT.compact_summary])
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

  it("MODEL_ALIASES は既定のモデルを含む4語", () => {
    expect(MODEL_ALIASES).toEqual(["opus", "sonnet", "haiku", "fable"])
  })
})
