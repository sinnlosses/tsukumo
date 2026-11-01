import { describe, expect, it } from "vitest"

import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"

describe("CallReview のセリフの言い換え表の検査", () => {
  it("地の文に登録語があるセリフは、語と言い換え先を示して差し戻す", () => {
    expect(createCallReview().judgeSpeechWording("架空のセリフで再演する")).toEqual({
      kind: "rejected",
      text: expect.stringContaining("「再演」は「タスクの再試」"),
    })
  })

  it("登録語が無いセリフと、コードの中だけにあるセリフは通す", () => {
    const review = createCallReview()

    expect(review.judgeSpeechWording("架空のセリフ")).toEqual({ kind: "accepted" })
    expect(review.judgeSpeechWording("架空の `再演` のセリフ")).toEqual({ kind: "accepted" })
  })

  it("差し戻し文はセリフの文面を写さない", () => {
    const verdict = createCallReview().judgeSpeechWording("架空の独自の文面と節点")

    expect(verdict.kind === "rejected" ? verdict.text : "").not.toContain("独自の文面")
  })
})
