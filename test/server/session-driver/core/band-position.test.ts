import { describe, expect, it } from "vitest"

import {
  bandPositionText,
  handbackNoteText,
} from "../../../../src/server/session-driver/core/band-position.ts"
import { workPlanOf } from "../../../../src/shared/session/work-plan-fold.ts"

const planned = (overrides: Partial<Parameters<typeof workPlanOf>[0]>) =>
  workPlanOf({
    phases: ["計画", "実装A", "実装B", "実装C", "受け入れ"],
    current: 2,
    finishedInGroup: [],
    phaseSummary: "",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    ...overrides,
  })

describe("bandPositionText", () => {
  it("ワークプランが無ければ空", () => {
    expect(bandPositionText({ kind: "none" })).toBe("")
  })

  it("範囲が無ければ今の段の位置と名前だけを言う", () => {
    expect(bandPositionText(planned({}))).toBe("帯の今の段は 3/5 実装B。")
  })

  it("全部済みなら今の段を言わない", () => {
    expect(bandPositionText(planned({ current: 5 }))).toBe("帯の段は全部済んでいる。")
  })

  it("範囲があれば群の名と群の中の番号で言い、群ごとの数え方と、セリフで番号を言うのは本だけなことを添える", () => {
    const text = bandPositionText(
      planned({ delegatedRange: { kind: "range", first: 1, count: 3 } }),
    )
    expect(text).toBe(
      "帯の今の段は 本 2/3 実装B。帯は範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数え、本の番号は委譲先の段の番号と同じ。セリフで番号を言うのは本の段だけで、前・後の段は名前で言う。",
    )
  })

  it("pending なら範囲の前だけを数え、範囲の先頭から後ろは番号を持たないことを添える", () => {
    expect(
      bandPositionText(planned({ current: 0, delegatedRange: { kind: "pending", first: 1 } })),
    ).toBe(
      "帯の今の段は 前 1/1 計画。範囲の先頭から後ろの段は番号を持たない（委譲先の段の数が決まるまで）。",
    )
  })

  it("今の段が範囲の前後なら、前・後の群の番号で言う", () => {
    const range = { kind: "range", first: 1, count: 3 } as const
    expect(bandPositionText(planned({ current: 0, delegatedRange: range }))).toContain(
      "帯の今の段は 前 1/1 計画。",
    )
    expect(bandPositionText(planned({ current: 4, delegatedRange: range }))).toContain(
      "帯の今の段は 後 1/1 受け入れ。",
    )
  })
})

describe("handbackNoteText", () => {
  it("行が無いかワークプランが無ければ空", () => {
    expect(handbackNoteText([], planned({}))).toBe("")
    expect(handbackNoteText(["架空の行。"], { kind: "none" })).toBe("")
  })

  it("注記の頭・返却ごとの行・帯の位置の文を1回だけ、この順に並べる", () => {
    expect(handbackNoteText(["架空の行1。", "架空の行2。"], planned({}))).toBe(
      "tsukumo の注記（委譲先の返却の本文ではない）:架空の行1。架空の行2。帯の今の段は 3/5 実装B。",
    )
  })
})
