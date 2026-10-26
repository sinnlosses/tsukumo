import { describe, expect, it } from "vitest"

import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"

describe("形の検査で落ちた report の記録", () => {
  const chars = { total: 40, fields: { sections: 12 } }
  const rejectionOf = (content: string) => {
    const review = createCallReview()
    review.pass({ kind: "report-malformed", toolUseId: "toolu_m", argumentChars: chars })
    return review.pass({ kind: "tool-finished", toolUseId: "toolu_m", content, isError: true })[1]
  }

  it("結果の本文に zod の issues があれば、欄名（添字は n）と code だけを残し、message と値は残さない", () => {
    const content = `Input validation error: Invalid arguments for tool report: ${JSON.stringify([
      {
        code: "invalid_union",
        path: ["sections", 0, "blocks", 2, "kind"],
        message: "架空のメッセージ",
        received: "架空の値",
        errors: [[{ code: "invalid_value", path: ["kind"], message: "入れ子は読まない" }]],
      },
    ])}`

    const rejection = rejectionOf(content)

    expect(rejection).toEqual({
      kind: "report-rejected",
      reasons: ["tool-error"],
      argumentChars: chars,
      inheritedFields: [],
      toolErrorFields: [{ field: "sections.n.blocks.n.kind", code: "invalid_union" }],
    })
    expect(JSON.stringify(rejection)).not.toMatch(/架空のメッセージ|架空の値|入れ子は読まない/)
  })

  it("引数が読めず handler に届かなかった report も、issues を持たない本文なら欄名は空で tool-error の report-rejected を出す", () => {
    expect(rejectionOf("架空の差し戻し")).toEqual({
      kind: "report-rejected",
      reasons: ["tool-error"],
      argumentChars: chars,
      inheritedFields: [],
      toolErrorFields: [],
    })
  })
})
