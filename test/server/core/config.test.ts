import { describe, expect, it } from "bun:test"

import { readConfig, readSessionMark, sessionTag } from "../../../src/server/core/config.ts"
import { DEFAULT_VIEW_PORT } from "../../../src/server/core/port-resolution.ts"

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
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT)).toBe("tsukumo:tsukumo@A")
    expect(sessionTag("tsukumo-spirit", false, DEFAULT_VIEW_PORT)).toBe("tsukumo:tsukumo-spirit@A")
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT)).not.toBe(
      sessionTag("tsukumo-spirit", false, DEFAULT_VIEW_PORT),
    )
  })

  it("雑談と仕事でも違う印になる（同じパックでも別のセッション）", () => {
    expect(sessionTag("tsukumo", true, DEFAULT_VIEW_PORT)).toBe("tsukumo:tsukumo:chat@A")
    expect(sessionTag("tsukumo", true, DEFAULT_VIEW_PORT)).not.toBe(
      sessionTag("tsukumo", false, DEFAULT_VIEW_PORT),
    )
    expect(sessionTag("tsukumo", true, DEFAULT_VIEW_PORT)).not.toBe(
      sessionTag("tsukumo-spirit", true, DEFAULT_VIEW_PORT),
    )
  })

  it("印の無い素の claude のセッションとも混ざらない（前置きが付く）", () => {
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT)).not.toBe("tsukumo")
  })

  it("ポートが1つずれるごとに目印が次の文字へ進む（同じディレクトリの2つめは別のセッション）", () => {
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT + 1)).toBe("tsukumo:tsukumo@B")
    expect(sessionTag("tsukumo", true, DEFAULT_VIEW_PORT + 2)).toBe("tsukumo:tsukumo:chat@C")
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT + 25)).toBe("tsukumo:tsukumo@Z")
  })

  it("Z の次（26個め）と既定から外れたポートは A に畳む", () => {
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT + 26)).toBe("tsukumo:tsukumo@A")
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT - 1)).toBe("tsukumo:tsukumo@A")
    expect(sessionTag("tsukumo", false, 0)).toBe("tsukumo:tsukumo@A")
  })
})

describe("readSessionMark", () => {
  it("組み立てた印を読み戻すと、目印と印がそのまま取れる", () => {
    expect(readSessionMark(sessionTag("架空のパック", false, DEFAULT_VIEW_PORT))).toEqual({
      slot: "A",
      tag: "tsukumo:架空のパック@A",
    })
    expect(readSessionMark(sessionTag("架空のパック", true, DEFAULT_VIEW_PORT + 1))).toEqual({
      slot: "B",
      tag: "tsukumo:架空のパック:chat@B",
    })
  })

  it("目印の無い昔の印は A とみなし、A の印と同じ形に揃える（互換）", () => {
    expect(readSessionMark("tsukumo:架空のパック")).toEqual({
      slot: "A",
      tag: sessionTag("架空のパック", false, DEFAULT_VIEW_PORT),
    })
    expect(readSessionMark("tsukumo:架空のパック:chat")).toEqual({
      slot: "A",
      tag: sessionTag("架空のパック", true, DEFAULT_VIEW_PORT),
    })
  })

  it("tsukumo の印でないものは読まない（素の claude のセッション）", () => {
    expect(readSessionMark("")).toBeUndefined()
    expect(readSessionMark("tsukumo")).toBeUndefined()
    expect(readSessionMark("べつの道具:架空のパック@A")).toBeUndefined()
  })

  it("名前に @ を含むパックも、組み立てた印と同じ形に揃う", () => {
    const tag = sessionTag("架空@パック", false, DEFAULT_VIEW_PORT)
    expect(readSessionMark("tsukumo:架空@パック")).toEqual({ slot: "A", tag })
    expect(readSessionMark(tag)).toEqual({ slot: "A", tag })
  })
})
