import { describe, expect, it } from "vitest"

import { reportViolations } from "../../../../../../src/server/report/core/rules/report-violation.ts"
import { createCallReview } from "../../../../../../src/server/session-driver/core/call-review.ts"
import { reportDraft } from "../../../../../fixture/report-event.ts"

const fieldNameViolations = (speechTexts: readonly string[]) =>
  reportViolations({ ...reportDraft({}), speechTexts }).filter(
    (violation) => violation.kind === "field-name-in-speech",
  )

describe("セリフの中の report の欄の名前", () => {
  it("締めのセリフが欄の名前で部品を指すと、名前を挙げて差し戻す", () => {
    expect(fieldNameViolations(["架空の keyFigures から見てくださいな。"])).toEqual([
      { kind: "field-name-in-speech", count: 1, names: ["keyFigures"] },
    ])
  })

  it("画面に見える語で指すセリフと、大文字を含まない欄と同じ綴りの語は通す", () => {
    expect(
      fieldNameViolations(["架空の数のカードから見てくださいな。", "架空の task の話"]),
    ).toEqual([])
  })

  it("speak のセリフも同じ検査で差し戻し、文面は写さない", () => {
    const verdict = createCallReview().judgeSpeechWording("架空の独自の文面と workDone")

    expect(verdict).toEqual({ kind: "rejected", text: expect.stringContaining("`workDone`") })
    expect(verdict.kind === "rejected" ? verdict.text : "").not.toContain("独自の文面")
  })
})
