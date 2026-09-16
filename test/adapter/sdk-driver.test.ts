import { describe, expect, it } from "bun:test"

import { type PermissionMode as SdkPermissionMode } from "@anthropic-ai/claude-agent-sdk"

import { buildQuerySeedOptions, DEFAULT_EFFORT } from "../../src/adapter/sdk-driver.ts"
import {
  DEFAULT_MODEL,
  DEFAULT_PERMISSION_MODE,
  type SessionDriverOptions,
} from "../../src/core/session-driver.ts"
import { MODEL_ALIASES, PERMISSION_MODES } from "../../src/protocol/command.ts"

// `startSession` 自体は本物の claude を子プロセスとして起こすので、ここでは呼ばない
// （docs/requirements.md 4.6 / CLAUDE.md「よく使うコマンド」）。`query()` に渡る `options` の
// うち、クロージャを含まない部分（`buildQuerySeedOptions`）だけを検査する。
const BASE_OPTIONS: SessionDriverOptions = {
  cwd: "/tmp/tsukumo-test",
  expressions: [{ name: "default", label: "通常" }],
  permissionMode: DEFAULT_PERMISSION_MODE,
  systemPromptAppend: "（テスト用の追記。会話の内容は含まない）",
  resume: undefined,
  tag: "tsukumo-test",
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
    expect(buildQuerySeedOptions({ ...BASE_OPTIONS, resume: "s-1" }).resume).toBe("s-1")
  })
})

describe("protocol の値の一覧と SDK の型", () => {
  it("PERMISSION_MODES はすべて SDK の PermissionMode として渡せる値", () => {
    // 代入できること自体が型の検査。**SDK 側にはこれ以外の値もある**（`dontAsk`。画面には
    // 出さないので protocol の一覧には入れていない）ので、確かめるのはこの向きだけ。
    const asSdk: readonly SdkPermissionMode[] = PERMISSION_MODES

    expect([...asSdk].sort()).toEqual([
      "acceptEdits",
      "auto",
      "bypassPermissions",
      "default",
      "plan",
    ])
  })

  it("MODEL_ALIASES は既定のモデルを含む3語", () => {
    expect(MODEL_ALIASES).toEqual(["opus", "sonnet", "haiku"])
    expect(MODEL_ALIASES).toContain(DEFAULT_MODEL)
  })
})
