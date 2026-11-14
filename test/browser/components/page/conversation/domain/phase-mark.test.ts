import { describe, expect, it } from "vitest"

import { doneMarkOf } from "../../../../../../src/browser/components/page/conversation/domain/phase-mark.ts"

describe("doneMarkOf", () => {
  it("済んだ段は「✓」、飛ばした段は「/」", () => {
    expect(doneMarkOf(false)).toBe("✓")
    expect(doneMarkOf(true)).toBe("/")
  })
})
