import { describe, expect, it } from "vitest"

import { byteLength } from "../../../src/shared/utils/byte-length.ts"

describe("byteLength", () => {
  it("ASCII は1字1バイト、全角は3バイト", () => {
    expect(byteLength("ab")).toBe(2)
    expect(byteLength("あ")).toBe(3)
  })

  it("サロゲートペアは4バイト", () => {
    expect(byteLength("😀")).toBe(4)
  })
})
