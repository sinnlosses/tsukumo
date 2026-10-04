import { describe, expect, it } from "vitest"

import { isClearWithArgs } from "../../../../../../src/browser/components/page/conversation/domain/clear-request.ts"

describe("isClearWithArgs", () => {
  it.each(["/clear 続きの文", "/clear\n続きの文", "/clear   a"])("%j は続きがある", (text) => {
    expect(isClearWithArgs(text)).toBe(true)
  })

  it.each(["/clear", "/clear   ", "/clear-foo bar", "/clearx y", "続き /clear 文", ""])(
    "%j は続きがない",
    (text) => {
      expect(isClearWithArgs(text)).toBe(false)
    },
  )
})
