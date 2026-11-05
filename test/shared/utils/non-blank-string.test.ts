import { describe, expect, it } from "vitest"

import { nonBlankString } from "../../../src/shared/utils/non-blank-string.ts"

describe("nonBlankString", () => {
  it("空白だけ（全角を含む）・文字列でない値は undefined", () => {
    expect(nonBlankString(" \n　")).toBeUndefined()
    expect(nonBlankString(1)).toBeUndefined()
  })

  it("中身があれば前後の空白を残したまま返す", () => {
    expect(nonBlankString(" あ ")).toBe(" あ ")
  })
})
