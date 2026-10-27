import { describe, expect, it } from "vitest"

import { agreementOf, choicesSchema, verdictOf } from "../../../scripts/runtime/pair-verdict.ts"

describe("verdictOf", () => {
  it("入れ替えても左が勝てば左の勝ち", () => {
    expect(verdictOf("first", "second")).toBe("left")
  })

  it("入れ替えても右が勝てば右の勝ち", () => {
    expect(verdictOf("second", "first")).toBe("right")
  })

  it("どちらの回も先に見せた側を選んだら引き分け", () => {
    expect(verdictOf("first", "first")).toBe("tie")
  })

  it("どちらの回も後に見せた側を選んだら引き分け", () => {
    expect(verdictOf("second", "second")).toBe("tie")
  })
})

describe("agreementOf", () => {
  it("選ばなかった対を分母に入れず、引き分けを一致に数えない", () => {
    const agreement = agreementOf(
      { choices: { r01: "left", r02: "right", r03: "left", r04: "undecided" } },
      { r01: "left", r02: "tie", r03: "right", r04: "left" },
    )

    expect(agreement).toEqual({
      chosen: 3,
      agreed: 1,
      ties: 1,
      rate: { kind: "measured", value: 1 / 3 },
    })
  })

  it("判定の無い対は一致に数えない", () => {
    const agreement = agreementOf({ choices: { r01: "right", r02: "left" } }, { r01: "right" })

    expect(agreement.agreed).toBe(1)
    expect(agreement.chosen).toBe(2)
  })

  it("選んだ対が無ければ一致率は無し", () => {
    const agreement = agreementOf({ choices: { r01: "undecided" } }, { r01: "left" })

    expect(agreement.rate).toEqual({ kind: "none" })
  })
})

describe("choicesSchema", () => {
  it("知らない値を拒む", () => {
    expect(choicesSchema.safeParse({ choices: { r01: "both" } }).success).toBe(false)
  })

  it("ひな形の形を読む", () => {
    expect(choicesSchema.safeParse({ choices: { r01: "undecided", r02: "left" } }).success).toBe(
      true,
    )
  })
})
