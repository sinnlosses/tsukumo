import { describe, expect, it } from "vitest"

import {
  parseReportRetrospective,
  retrospectiveSections,
} from "../../../src/shared/report/report-retrospective.ts"

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

describe("retrospectiveSections", () => {
  it("欄が無ければ節は無く、あれば見出し「振り返り」の節に結果・塊・ドラフトの ID をこの順で入れる", () => {
    expect(retrospectiveSections({ kind: "none" })).toEqual([])
    expect(
      retrospectiveSections({
        kind: "recorded",
        summary: "架空の結果。",
        drafts: ["架空-1", "架空-2"],
        blocks: [{ kind: "text", text: "架空の補足。", fold: "", aside: "" }],
      }),
    ).toEqual([
      {
        heading: "振り返り",
        shapeTag: "unspecified",
        blocks: [
          { kind: "text", text: "架空の結果。", fold: "", aside: "" },
          { kind: "text", text: "架空の補足。", fold: "", aside: "" },
          { kind: "text", text: "積んだドラフト: `架空-1`、`架空-2`", fold: "", aside: "" },
        ],
      },
    ])
  })
})
