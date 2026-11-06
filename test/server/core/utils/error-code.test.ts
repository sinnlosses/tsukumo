import { describe, expect, it } from "vitest"

import { hasErrorCode } from "../../../../src/server/core/utils/error-code.ts"

describe("hasErrorCode", () => {
  it("code が一致する Error は true", () => {
    const error = Object.assign(new Error("x"), { code: "ESRCH" })
    expect(hasErrorCode(error, "ESRCH")).toBe(true)
  })

  it("code が違う・無い・Error でないものは false", () => {
    const error = Object.assign(new Error("x"), { code: "EPERM" })
    expect(hasErrorCode(error, "ESRCH")).toBe(false)
    expect(hasErrorCode(new Error("x"), "ESRCH")).toBe(false)
    expect(hasErrorCode({ code: "ESRCH" }, "ESRCH")).toBe(false)
    expect(hasErrorCode("ESRCH", "ESRCH")).toBe(false)
  })
})
