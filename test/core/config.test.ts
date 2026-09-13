import { describe, expect, it } from "bun:test"

import { readConfig } from "../../src/core/config.ts"

describe("readConfig", () => {
  it("何も無ければ既定（sdk の駆動・タブを開く・キャラクターは同梱）", () => {
    expect(readConfig({})).toEqual({
      rawViewPort: undefined,
      character: undefined,
      openView: true,
      driver: "sdk",
      newSession: false,
    })
  })

  it("環境変数をそのまま読む（ポートは解釈せず生のまま渡す）", () => {
    expect(
      readConfig({
        TSUKUMO_VIEW_PORT: "7398",
        TSUKUMO_CHARACTER: " characters/local ",
        TSUKUMO_OPEN_VIEW: "0",
        TSUKUMO_DRIVER: "fake",
        TSUKUMO_NEW_SESSION: "1",
      }),
    ).toEqual({
      rawViewPort: "7398",
      character: "characters/local",
      openView: false,
      driver: "fake",
      newSession: true,
    })
  })

  it("知らない駆動の名前は sdk に倒す", () => {
    expect(readConfig({ TSUKUMO_DRIVER: "まぼろし" }).driver).toBe("sdk")
  })
})
