import { describe, expect, it } from "bun:test"

import { readConfig, readReportChannel } from "../../../src/server/core/config.ts"

describe("readConfig", () => {
  it("何も無ければ既定（sdk の駆動・タブを開く・キャラクターは同梱）", () => {
    expect(readConfig({})).toEqual({
      rawViewPort: undefined,
      rawViewPortFallbackBase: undefined,
      character: undefined,
      openView: true,
      driver: "sdk",
      fakeScene: undefined,
      newSession: false,
      watchUi: false,
    })
  })

  it("環境変数をそのまま読む（ポートは解釈せず生のまま渡す）", () => {
    expect(
      readConfig({
        TSUKUMO_VIEW_PORT: "7398",
        TSUKUMO_VIEW_PORT_FALLBACK_BASE: "20000",
        TSUKUMO_CHARACTER: " characters/local ",
        TSUKUMO_OPEN_VIEW: "0",
        TSUKUMO_DRIVER: "fake",
        TSUKUMO_FAKE_SCENE: " question-multi ",
        TSUKUMO_NEW_SESSION: "1",
        TSUKUMO_WATCH_UI: "1",
      }),
    ).toEqual({
      rawViewPort: "7398",
      rawViewPortFallbackBase: "20000",
      character: "characters/local",
      openView: false,
      driver: "fake",
      fakeScene: "question-multi",
      newSession: true,
      watchUi: true,
    })
  })

  it("知らない駆動の名前は sdk に倒す", () => {
    expect(readConfig({ TSUKUMO_DRIVER: "まぼろし" }).driver).toBe("sdk")
  })
})

describe("readReportChannel（試行の口）", () => {
  it("未設定・1 以外は今までどおり text", () => {
    expect(readReportChannel({})).toBe("text")
    expect(readReportChannel({ TSUKUMO_REPORT_TOOL: "0" })).toBe("text")
    expect(readReportChannel({ TSUKUMO_REPORT_TOOL: "yes" })).toBe("text")
  })

  it("1 のときだけ tool（前後の空白は許す）", () => {
    expect(readReportChannel({ TSUKUMO_REPORT_TOOL: " 1 " })).toBe("tool")
  })
})
