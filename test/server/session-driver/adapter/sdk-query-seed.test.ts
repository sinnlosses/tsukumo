import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { tsukumoHomeDir } from "../../../../src/server/adapter/tsukumo-home.ts"
import { buildQuerySeedOptions } from "../../../../src/server/session-driver/adapter/sdk-query-seed.ts"
import type { SessionDriverOptions } from "../../../../src/server/session-driver/core/session-driver.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../../../src/shared/session/session-default.ts"
import { WORK_MODE } from "../../../fixture/sdk-tool.ts"

// `startSdkDriver` 自体は本物の claude を子プロセスとして起こすので、ここでは呼ばない
// （docs/requirements.md「起動と設定」 / AGENTS.md「よく使うコマンド」）。`query()` に渡る `options` の
// うち、クロージャを含まない部分（`buildQuerySeedOptions`）だけを検査する。
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
  reportWorkflowTwFailure: () => {},
  reportHandbackHeadMismatch: () => {},
  reportGateBlock: () => {},
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

  it("引き継いだ環境変数に Claude Code の催促を止める2つの変数を足して子プロセスへ渡す", () => {
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
