import { describe, expect, it } from "bun:test"

import { readConfig, sessionTag } from "../../../src/server/core/config.ts"

describe("readConfig", () => {
  it("何も無ければ既定（sdk の駆動・タブを開く・キャラクターは同梱）", () => {
    expect(readConfig({})).toEqual({
      rawViewPort: undefined,
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
        TSUKUMO_CHARACTER: " characters/local ",
        TSUKUMO_OPEN_VIEW: "0",
        TSUKUMO_DRIVER: "fake",
        TSUKUMO_FAKE_SCENE: " question-multi ",
        TSUKUMO_NEW_SESSION: "1",
        TSUKUMO_WATCH_UI: "1",
      }),
    ).toEqual({
      rawViewPort: "7398",
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

describe("sessionTag", () => {
  it("キャラクターパックごとに違う印を組み立てる（キャラクターごとに別のセッション）", () => {
    expect(sessionTag("tsukumo", false)).toBe("tsukumo:tsukumo")
    expect(sessionTag("tsukumo-spirit", false)).toBe("tsukumo:tsukumo-spirit")
    expect(sessionTag("tsukumo", false)).not.toBe(sessionTag("tsukumo-spirit", false))
  })

  it("雑談と仕事でも違う印になる（同じパックでも別のセッション）", () => {
    expect(sessionTag("tsukumo", true)).toBe("tsukumo:tsukumo:chat")
    expect(sessionTag("tsukumo", true)).not.toBe(sessionTag("tsukumo", false))
    expect(sessionTag("tsukumo", true)).not.toBe(sessionTag("tsukumo-spirit", true))
  })

  it("印の無い素の claude のセッションとも混ざらない（前置きが付く）", () => {
    expect(sessionTag("tsukumo", false)).not.toBe("tsukumo")
  })
})
