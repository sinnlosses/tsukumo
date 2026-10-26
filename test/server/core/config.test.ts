import { describe, expect, it } from "vitest"

import { readConfig } from "../../../src/server/core/config.ts"

describe("readConfig", () => {
  it("何も無ければ既定（sdk の駆動・タブを開く・キャラクターは同梱）", () => {
    expect(readConfig({})).toEqual({
      rawViewPort: undefined,
      rawViewPortFallbackBase: undefined,
      character: undefined,
      openView: true,
      driver: { kind: "sdk" },
      host: "browser",
      twCommand: undefined,
      claudeConfigDir: undefined,
      fixedClock: undefined,
      reportSchema: "json-schema",
      disallowedTools: ["NotebookEdit", "Artifact", "ArtifactComments", "ArtifactData"],
      turnStepLimit: 200,
      inheritedEnv: {},
    })
  })

  it.each([
    ["Orca の中で未設定なら orca", { TERM_PROGRAM: "Orca" }, "orca"],
    ["Orca の外で未設定ならブラウザ", { TERM_PROGRAM: "iTerm.app" }, "browser"],
    ["TERM_PROGRAM が無ければブラウザ", {}, "browser"],
    ["Orca の中で知らない値なら orca", { TERM_PROGRAM: "Orca", TSUKUMO_HOST: "emacs" }, "orca"],
    ["Orca の外で知らない値ならブラウザ", { TSUKUMO_HOST: "emacs" }, "browser"],
    ["明示の orca は外でも効く", { TERM_PROGRAM: "iTerm.app", TSUKUMO_HOST: " orca " }, "orca"],
    [
      "明示の browser は Orca の中でも効く",
      { TERM_PROGRAM: "Orca", TSUKUMO_HOST: "browser" },
      "browser",
    ],
    ["明示の none は Orca の中でも効く", { TERM_PROGRAM: "Orca", TSUKUMO_HOST: "none" }, "none"],
  ] as const)("ホスト: %s", (_name, env, expected) => {
    expect(readConfig(env).host).toBe(expected)
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
      TSUKUMO_FAKE_SCENE_UNTIL: " 3 ",
      TSUKUMO_FAKE_SESSION: " /somewhere/session.json ",
      TSUKUMO_TW: " /somewhere/fake-tw ",
      CLAUDE_CONFIG_DIR: " /somewhere/claude ",
      TSUKUMO_REPORT_SCHEMA: " short-type ",
      TSUKUMO_DISALLOWED_TOOLS: " NotebookEdit, Artifact ",
      TSUKUMO_TURN_STEP_LIMIT: " 50 ",
    }

    expect(readConfig(env)).toEqual({
      rawViewPort: "7398",
      rawViewPortFallbackBase: "20000",
      character: "characters/local",
      openView: false,
      driver: {
        kind: "fake",
        sessionPath: "/somewhere/session.json",
        scene: "question-multi",
        sceneUntil: 3,
      },
      host: "none",
      twCommand: "/somewhere/fake-tw",
      claudeConfigDir: "/somewhere/claude",
      fixedClock: undefined,
      reportSchema: "short-type",
      disallowedTools: ["NotebookEdit", "Artifact"],
      turnStepLimit: 50,
      // 子プロセスへ引き継ぐ分は、読んだ環境をそのまま持つ
      inheritedEnv: env,
    })
  })

  it("CLAUDE_CONFIG_DIR が空文字なら未設定と同じに倒す", () => {
    expect(readConfig({ CLAUDE_CONFIG_DIR: "  " }).claudeConfigDir).toBeUndefined()
  })

  it("疑似セッションのパスは空白だけなら同梱に倒し、fake 以外の駆動では読まない", () => {
    expect(readConfig({ TSUKUMO_DRIVER: "fake", TSUKUMO_FAKE_SESSION: "  " }).driver).toEqual({
      kind: "fake",
      sessionPath: undefined,
      scene: undefined,
      sceneUntil: undefined,
    })
    expect(readConfig({ TSUKUMO_FAKE_SESSION: "/somewhere/session.json" }).driver).toEqual({
      kind: "sdk",
    })
  })

  it("TSUKUMO_TW が空白だけなら未設定と同じに倒す", () => {
    expect(readConfig({ TSUKUMO_TW: "  " }).twCommand).toBeUndefined()
  })

  it("凍らせる瞬間は ISO 8601 の瞬間として読み、読めない値は本物の時計に倒す", () => {
    expect(
      readConfig({ TSUKUMO_FIXED_CLOCK: " 2026-01-02T03:04:05Z " }).fixedClock?.epochMilliseconds,
    ).toBe(Temporal.Instant.from("2026-01-02T03:04:05Z").epochMilliseconds)
    expect(readConfig({ TSUKUMO_FIXED_CLOCK: "あした" }).fixedClock).toBeUndefined()
  })

  it("知らない駆動の名前は sdk に倒す", () => {
    expect(readConfig({ TSUKUMO_DRIVER: "まぼろし" }).driver).toEqual({ kind: "sdk" })
  })

  it.each([
    ["空白だけなら既定", " ", ["NotebookEdit", "Artifact", "ArtifactComments", "ArtifactData"]],
    ["カンマ区切りを空白ごと切る", " A , B,,", ["A", "B"]],
    ["none は何も外さない", "none", []],
  ] as const)("外すツール: %s", (_name, raw, expected) => {
    expect(readConfig({ TSUKUMO_DISALLOWED_TOOLS: raw }).disallowedTools).toEqual(expected)
  })

  it("読めない歩数の上限は 200 に倒す", () => {
    expect(readConfig({ TSUKUMO_TURN_STEP_LIMIT: "0" }).turnStepLimit).toBe(200)
    expect(readConfig({ TSUKUMO_TURN_STEP_LIMIT: "たくさん" }).turnStepLimit).toBe(200)
  })

  it("知らない型の渡し方は json-schema に倒す", () => {
    expect(readConfig({ TSUKUMO_REPORT_SCHEMA: "json" }).reportSchema).toBe("json-schema")
  })
})
