import { describe, expect, it } from "bun:test"

import { byteLength } from "../../../src/shared/lib/byte-length.ts"

describe("byteLength", () => {
  it("ASCII は文字数と同じ", () => {
    expect(byteLength("hello")).toBe(5)
  })

  it("空文字は0", () => {
    expect(byteLength("")).toBe(0)
  })

  it("日本語（マルチバイト）を UTF-8 のバイト数で数える", () => {
    // 「あ」は UTF-8 で3バイト。
    expect(byteLength("あ")).toBe(3)
    expect(byteLength("あいう")).toBe(9)
  })

  it("絵文字（サロゲートペア）も UTF-8 のバイト数で数える", () => {
    // U+1F600 は UTF-8 で4バイト。
    expect(byteLength("😀")).toBe(4)
  })
})
