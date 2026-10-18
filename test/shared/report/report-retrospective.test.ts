import { describe, expect, it } from "vitest"

import {
  parseReportRetrospective,
  retrospectiveMarkdown,
} from "../../../src/shared/report/report-retrospective.ts"

describe("parseReportRetrospective", () => {
  it("欄が無い・形が崩れたときは none に畳み、drafts の無い欄は空の配列にする", () => {
    expect(parseReportRetrospective(undefined)).toEqual({ kind: "none" })
    expect(parseReportRetrospective({ summary: "  " })).toEqual({ kind: "none" })
    expect(parseReportRetrospective({ summary: "架空の結果。" })).toEqual({
      kind: "recorded",
      summary: "架空の結果。",
      drafts: [],
    })
  })
})

describe("retrospectiveMarkdown", () => {
  it("欄が無ければ空、あれば結果とドラフトの ID を専用の塊に入れる", () => {
    expect(retrospectiveMarkdown({ kind: "none" })).toBe("")
    expect(
      retrospectiveMarkdown({
        kind: "recorded",
        summary: "架空の結果。",
        drafts: ["架空-1", "架空-2"],
      }),
    ).toBe(
      '<div class="retrospective">\n\n<div class="retrospective-label">振り返り</div>\n\n' +
        "架空の結果。\n\n積んだドラフト: `架空-1`、`架空-2`\n\n</div>",
    )
  })
})
