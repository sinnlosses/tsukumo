import { describe, expect, it } from "vitest"

import {
  readSessionMark,
  sessionTag,
} from "../../../../src/server/session-driver/core/session-mark.ts"
import { DEFAULT_VIEW_PORT } from "../../../../src/server/view-server/core/port-resolution.ts"

describe("sessionTag", () => {
  it("キャラクターパックごとに違う印を組み立てる（キャラクターごとに別のセッション）", () => {
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT)).toBe("tsukumo:tsukumo@7327")
    expect(sessionTag("tsukumo-spirit", false, DEFAULT_VIEW_PORT)).toBe(
      "tsukumo:tsukumo-spirit@7327",
    )
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT)).not.toBe(
      sessionTag("tsukumo-spirit", false, DEFAULT_VIEW_PORT),
    )
  })

  it("雑談と仕事でも違う印になる（同じパックでも別のセッション）", () => {
    expect(sessionTag("tsukumo", true, DEFAULT_VIEW_PORT)).toBe("tsukumo:tsukumo:chat@7327")
    expect(sessionTag("tsukumo", true, DEFAULT_VIEW_PORT)).not.toBe(
      sessionTag("tsukumo", false, DEFAULT_VIEW_PORT),
    )
    expect(sessionTag("tsukumo", true, DEFAULT_VIEW_PORT)).not.toBe(
      sessionTag("tsukumo-spirit", true, DEFAULT_VIEW_PORT),
    )
  })

  it("目印はビューのポート番号そのもの（同じディレクトリの2つめは別のセッション）", () => {
    expect(sessionTag("tsukumo", false, DEFAULT_VIEW_PORT + 1)).toBe("tsukumo:tsukumo@7328")
    expect(sessionTag("tsukumo", true, DEFAULT_VIEW_PORT + 2)).toBe("tsukumo:tsukumo:chat@7329")
  })

  it("既定から遠いポートも `0` も畳まず、そのまま名乗る", () => {
    expect(sessionTag("tsukumo", false, 9000)).toBe("tsukumo:tsukumo@9000")
    expect(sessionTag("tsukumo", false, 0)).toBe("tsukumo:tsukumo@0")
  })
})

describe("readSessionMark", () => {
  it("組み立てた印を読み戻すと、目印（ポート番号）と印がそのまま取れる", () => {
    expect(readSessionMark(sessionTag("架空のパック", false, DEFAULT_VIEW_PORT))).toEqual({
      viewPort: DEFAULT_VIEW_PORT,
      tag: "tsukumo:架空のパック@7327",
    })
    expect(readSessionMark(sessionTag("架空のパック", true, DEFAULT_VIEW_PORT + 1))).toEqual({
      viewPort: DEFAULT_VIEW_PORT + 1,
      tag: "tsukumo:架空のパック:chat@7328",
    })
  })

  it("既定から遠いポートの目印も、そのまま読める", () => {
    expect(readSessionMark(sessionTag("架空のパック", false, 9000))).toEqual({
      viewPort: 9000,
      tag: "tsukumo:架空のパック@9000",
    })
  })

  it("目印の無い昔の印は既定のポートとみなし、今の形に揃える（互換）", () => {
    expect(readSessionMark("tsukumo:架空のパック")).toEqual({
      viewPort: DEFAULT_VIEW_PORT,
      tag: sessionTag("架空のパック", false, DEFAULT_VIEW_PORT),
    })
    expect(readSessionMark("tsukumo:架空のパック:chat")).toEqual({
      viewPort: DEFAULT_VIEW_PORT,
      tag: sessionTag("架空のパック", true, DEFAULT_VIEW_PORT),
    })
  })

  it("1文字だった昔の目印は、並び順から元のポートへ戻す（互換）", () => {
    expect(readSessionMark("tsukumo:架空のパック@A")).toEqual({
      viewPort: DEFAULT_VIEW_PORT,
      tag: sessionTag("架空のパック", false, DEFAULT_VIEW_PORT),
    })
    expect(readSessionMark("tsukumo:架空のパック:chat@B")).toEqual({
      viewPort: DEFAULT_VIEW_PORT + 1,
      tag: sessionTag("架空のパック", true, DEFAULT_VIEW_PORT + 1),
    })
    expect(readSessionMark("tsukumo:架空のパック@Z")).toEqual({
      viewPort: DEFAULT_VIEW_PORT + 25,
      tag: sessionTag("架空のパック", false, DEFAULT_VIEW_PORT + 25),
    })
  })

  it("tsukumo の印でないものは読まない（素の claude のセッション）", () => {
    expect(readSessionMark("")).toBeUndefined()
    expect(readSessionMark("tsukumo")).toBeUndefined()
    expect(readSessionMark("べつの道具:架空のパック@7327")).toBeUndefined()
  })

  it("名前に @ を含むパックも、組み立てた印と同じ形に揃う", () => {
    const tag = sessionTag("架空@パック", false, DEFAULT_VIEW_PORT)
    const mark = { viewPort: DEFAULT_VIEW_PORT, tag }
    expect(readSessionMark("tsukumo:架空@パック")).toEqual(mark)
    expect(readSessionMark(tag)).toEqual(mark)
  })

  it("ポートとして読めない目印は、目印が無いものとして扱う", () => {
    expect(readSessionMark("tsukumo:架空のパック@65536")).toEqual({
      viewPort: DEFAULT_VIEW_PORT,
      tag: "tsukumo:架空のパック@65536@7327",
    })
  })
})
