import { describe, expect, it } from "vitest"

import { bandPositionText } from "../../../../src/server/session-driver/core/band-position.ts"
import { workPlanOf } from "../../../../src/shared/session/work-plan.ts"

const planned = (overrides: Partial<Parameters<typeof workPlanOf>[0]>) =>
  workPlanOf({
    phases: ["計画", "実装A", "実装B", "実装C", "受け入れ"],
    current: 2,
    finishedInGroup: [],
    phaseSummary: "",
    delegatedRange: { kind: "none" },
    ...overrides,
  })

describe("bandPositionText", () => {
  it("段取りが無ければ空", () => {
    expect(bandPositionText({ kind: "none" })).toBe("")
  })

  it("範囲が無ければ今の段の位置と名前だけを言う", () => {
    expect(bandPositionText(planned({}))).toBe("帯の今の段は 3/5 実装B。")
  })

  it("全部済みなら今の段を言わない", () => {
    expect(bandPositionText(planned({ current: 5 }))).toBe("帯の段は全部済んでいる。")
  })

  it("範囲の前にメインの段があれば、委譲先の段と帯の番号の違いを言う", () => {
    const text = bandPositionText(
      planned({ delegatedRange: { kind: "range", first: 1, count: 3 } }),
    )
    expect(text).toBe(
      "帯の今の段は 3/5 実装B。委譲先の段 1〜3 は帯の 2〜4 番目（委譲先の段 n は帯の 1 + n 番目）。",
    )
  })
})
