import { describe, expect, it } from "vitest"

import { errorMessage } from "../../../src/browser/utils/error-message.ts"

describe("errorMessage", () => {
  it("Error は message を返す", () => {
    expect(errorMessage(new Error("壊れた"))).toBe("壊れた")
  })

  it("Error 以外は文字列にして返す", () => {
    expect(errorMessage("文字列")).toBe("文字列")
    expect(errorMessage(42)).toBe("42")
  })
})
