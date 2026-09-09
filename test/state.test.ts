import { describe, expect, it } from "bun:test"

import { parseStateFile } from "../src/state.ts"

describe("parseStateFile", () => {
  it("event と model を持つ状態ファイルをパースする", () => {
    const content = JSON.stringify({ event: "PreToolUse", model: "opus" })

    expect(parseStateFile(content)).toEqual({ event: "PreToolUse", model: "opus" })
  })

  it("model が無くても event だけでパースできる", () => {
    const content = JSON.stringify({ event: "PreToolUse" })

    expect(parseStateFile(content)).toEqual({ event: "PreToolUse", model: undefined })
  })

  it("未知のイベント種別でも文字列であればそのまま持ち出す（弾くのは決める層の仕事）", () => {
    const content = JSON.stringify({ event: "SomeFutureEvent" })

    expect(parseStateFile(content)).toEqual({ event: "SomeFutureEvent", model: undefined })
  })

  it("JSON として不正なときは undefined を返す", () => {
    expect(parseStateFile("{not valid json")).toBeUndefined()
  })

  it("空文字列のときは undefined を返す", () => {
    expect(parseStateFile("")).toBeUndefined()
  })

  it("event が無いときは undefined を返す", () => {
    expect(parseStateFile(JSON.stringify({ model: "opus" }))).toBeUndefined()
  })

  it("event が文字列でないときは undefined を返す", () => {
    expect(parseStateFile(JSON.stringify({ event: 1 }))).toBeUndefined()
  })

  it("model が文字列でも undefined でもないときは undefined を返す", () => {
    expect(parseStateFile(JSON.stringify({ event: "Stop", model: 42 }))).toBeUndefined()
  })

  it("オブジェクトでない JSON（配列・プリミティブ）のときは undefined を返す", () => {
    expect(parseStateFile("[]")).toBeUndefined()
    expect(parseStateFile("null")).toBeUndefined()
    expect(parseStateFile('"just a string"')).toBeUndefined()
  })
})
