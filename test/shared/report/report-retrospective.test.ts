import { describe, expect, it } from "vitest"

import { parseReportRetrospective } from "../../../src/shared/report/report-retrospective.ts"

describe("parseReportRetrospective", () => {
  it("欄が無い・形が崩れたときは none に畳み、drafts と blocks の無い欄は空の配列にする", () => {
    expect(parseReportRetrospective(undefined)).toEqual({ kind: "none" })
    expect(parseReportRetrospective({ summary: "  " })).toEqual({ kind: "none" })
    expect(parseReportRetrospective({ summary: "架空の結果。" })).toEqual({
      kind: "recorded",
      summary: "架空の結果。",
      drafts: [],
      blocks: [],
    })
  })

  it("塊は1つずつ検証し、崩れた塊と知らない種類の塊だけを落として結果は残す", () => {
    const parsed = parseReportRetrospective({
      summary: "架空の結果。",
      blocks: [
        { kind: "text", text: "架空の補足。" },
        { kind: "架空の種類", text: "x" },
        { kind: "list", style: "bullet" },
      ],
    })

    expect(parsed).toEqual({
      kind: "recorded",
      summary: "架空の結果。",
      drafts: [],
      blocks: [{ kind: "text", text: "架空の補足。", fold: "", aside: "" }],
    })
  })
})
