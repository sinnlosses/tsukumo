import { describe, expect, it } from "vitest"

import { readConfig } from "../../../src/server/core/config.ts"

describe("readConfig", () => {
  it("何も無ければ既定（sdk の駆動・タブを開く・キャラクターは同梱）", () => {
    expect(readConfig({})).toEqual({
      rawViewPort: undefined,
      rawViewPortFallbackBase: undefined,
      character: undefined,
      openView: true,
      driver: "sdk",
      host: "orca",
      fakeScene: undefined,
      newSession: false,
      claudeConfigDir: undefined,
      fixedClock: undefined,
      inheritedEnv: {},
    })
  })

  it("環境変数をそのまま読む（ポートは解釈せず生のまま渡す）", () => {
    const env = {
      TSUKUMO_VIEW_PORT: "7398",
      TSUKUMO_VIEW_PORT_FALLBACK_BASE: "20000",
      TSUKUMO_CHARACTER: " characters/local ",
      TSUKUMO_OPEN_VIEW: "0",
      TSUKUMO_DRIVER: "fake",
      TSUKUMO_HOST: " none ",
      TSUKUMO_FAKE_SCENE: " question-multi ",
      TSUKUMO_NEW_SESSION: "1",
      CLAUDE_CONFIG_DIR: " /somewhere/claude ",
    }

    expect(readConfig(env)).toEqual({
      rawViewPort: "7398",
      rawViewPortFallbackBase: "20000",
      character: "characters/local",
      openView: false,
      driver: "fake",
      host: "none",
      fakeScene: "question-multi",
      newSession: true,
      claudeConfigDir: "/somewhere/claude",
      fixedClock: undefined,
      // 子プロセスへ引き継ぐ分は、読んだ環境をそのまま持つ
      inheritedEnv: env,
    })
  })

  it("CLAUDE_CONFIG_DIR が空文字なら未設定と同じに倒す", () => {
    expect(readConfig({ CLAUDE_CONFIG_DIR: "  " }).claudeConfigDir).toBeUndefined()
  })

  it("凍らせる瞬間は ISO 8601 の瞬間として読み、読めない値は本物の時計に倒す", () => {
    expect(
      readConfig({ TSUKUMO_FIXED_CLOCK: " 2026-01-02T03:04:05Z " }).fixedClock?.epochMilliseconds,
    ).toBe(Temporal.Instant.from("2026-01-02T03:04:05Z").epochMilliseconds)
    expect(readConfig({ TSUKUMO_FIXED_CLOCK: "あした" }).fixedClock).toBeUndefined()
  })

  it("知らない駆動の名前は sdk に倒す", () => {
    expect(readConfig({ TSUKUMO_DRIVER: "まぼろし" }).driver).toBe("sdk")
  })
})
