import { describe, expect, it } from "vitest"

import { summaryParagraphs } from "../../../src/shared/session/session-digest.ts"

describe("要約の段落", () => {
  it("空行でも改行1つでも段落に割り、前後の空白と空の段落を落とす", () => {
    expect(summaryParagraphs("架空の一段落目。\n\n  架空の二段落目。\n架空の三段落目。\n")).toEqual(
      ["架空の一段落目。", "架空の二段落目。", "架空の三段落目。"],
    )
  })
})
