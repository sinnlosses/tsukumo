import { describe, expect, it } from "vitest"

import { COMMAND_ERRORS } from "../../src/shared/command.ts"
import { FRAME_ERROR_REASON } from "../../src/shared/frame.ts"

describe("COMMAND_ERRORS.REFUSED", () => {
  it.each(Object.values(FRAME_ERROR_REASON))("定型文の理由 %s は通す", (reason) => {
    expect(COMMAND_ERRORS.REFUSED.data.safeParse({ reason }).success).toBe(true)
  })

  it("定型文に無い理由は拒む", () => {
    expect(COMMAND_ERRORS.REFUSED.data.safeParse({ reason: "手で書いた文言" }).success).toBe(false)
  })
})
