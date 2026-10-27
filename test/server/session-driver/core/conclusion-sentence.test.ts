import { describe, expect, it } from "vitest"

import { parseConclusion } from "../../../../src/server/session-driver/core/conclusion-sentence.ts"

describe("parseConclusion の conclusionFirstSentence", () => {
  it.each([
    { value: ["架空の一文目。", "架空の二文目。"], first: "架空の一文目。" },
    { value: ["架空の結論A", "架空の補足B"], first: "架空の結論A" },
    { value: ["「架空の設定。」を直した。"], first: "「架空の設定。」を直した。" },
    { value: " 架空の結論。 ", first: "架空の結論。" },
    { value: [], first: "" },
    { value: undefined, first: "" },
  ])("$value の1要素目は $first", ({ value, first }) => {
    expect(parseConclusion(value)?.conclusionFirstSentence).toBe(first)
  })
})
