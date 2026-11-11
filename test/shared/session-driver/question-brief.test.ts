import { describe, expect, it } from "vitest"

import { questionBriefSchema } from "../../../src/shared/session-driver/question-brief.ts"

function briefOf(given: {
  readonly basis?: string
  readonly certainty?: string
  readonly withRecommended?: boolean
}): unknown {
  return {
    header: "架空の見出し",
    whyAsk: "架空の理由。",
    facts: [{ text: "架空の事実。", basis: given.basis ?? "checked" }],
    ...(given.withRecommended === false
      ? {}
      : { recommended: { reason: "架空の勧める理由。", certainty: given.certainty ?? "high" } }),
    options: [{ label: "A案" }, { label: "B案" }],
  }
}

describe("questionBriefSchema", () => {
  it.each(["checked", "copied"])("facts の basis が %s なら通る", (basis) => {
    expect(questionBriefSchema.safeParse(briefOf({ basis })).success).toBe(true)
  })

  it.each(["confirmed", "inferred", ""])("facts の basis が語彙の外（%s）なら落ちる", (basis) => {
    expect(questionBriefSchema.safeParse(briefOf({ basis })).success).toBe(false)
  })

  it.each(["high", "medium", "low"])("recommended の certainty が %s なら通る", (certainty) => {
    expect(questionBriefSchema.safeParse(briefOf({ certainty })).success).toBe(true)
  })

  it.each(["confirmed", "unverified", ""])(
    "recommended の certainty が語彙の外（%s）なら落ちる",
    (certainty) => {
      expect(questionBriefSchema.safeParse(briefOf({ certainty })).success).toBe(false)
    },
  )

  it("recommended は省ける", () => {
    expect(questionBriefSchema.safeParse(briefOf({ withRecommended: false })).success).toBe(true)
  })
})
