import { describe, expect, it } from "vitest"

import {
  bandPositionText,
  delegatedRangeFromAnswer,
  delegatedRangeLine,
  handbackNoteText,
} from "../../../../src/server/work-plan/core/band-position.ts"
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
    expect(bandPositionText(planned({}))).toBe("プログレスバーの今のフェーズは 3/5 実装B。")
  })

  it("全部済みなら今の段を言わない", () => {
    expect(bandPositionText(planned({ current: 5 }))).toBe(
      "プログレスバーのフェーズは全部済んでいる。",
    )
  })

  it("範囲があれば群の名と群の中の番号で言い、群ごとの数え方と、セリフで番号を言うのは本だけなことを添える", () => {
    const text = bandPositionText(
      planned({ delegatedRange: { kind: "range", first: 1, count: 3 } }),
    )
    expect(text).toBe(
      "プログレスバーの今のフェーズは 本 2/3 実装B。プログレスバーは範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数え、本の番号は委譲先のフェーズの番号と同じ。セリフで番号を言うのは本だけで、前・後は名前で言う。",
    )
  })

  it("pending なら範囲の前だけを数え、範囲の先頭から後ろは番号を持たないことを添える", () => {
    expect(
      bandPositionText(planned({ current: 0, delegatedRange: { kind: "pending", first: 1 } })),
    ).toBe(
      "プログレスバーの今のフェーズは 前 1/1 計画。範囲の先頭から後ろは番号を持たない（委譲先のフェーズの数が決まるまで）。",
    )
  })

  it("今の段が範囲の前後なら、前・後の群の番号で言う", () => {
    const range = { kind: "range", first: 1, count: 3 } as const
    expect(bandPositionText(planned({ current: 0, delegatedRange: range }))).toContain(
      "プログレスバーの今のフェーズは 前 1/1 計画。",
    )
    expect(bandPositionText(planned({ current: 4, delegatedRange: range }))).toContain(
      "プログレスバーの今のフェーズは 後 1/1 受け入れ。",
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
      "tsukumo の注記（委譲先の返却の本文ではない）:架空の行1。架空の行2。プログレスバーの今のフェーズは 3/5 実装B。",
    )
  })
})

describe("delegatedRangeFromAnswer", () => {
  it("delegatedRangeLine が書いた行と、言い換える前の「段」の行の両方から範囲を読む", () => {
    const range = { kind: "range", first: 1, count: 2 } as const
    expect(delegatedRangeFromAnswer(`ok\n${delegatedRangeLine(range)}`)).toEqual(range)
    expect(delegatedRangeFromAnswer("ok\n委譲先のフェーズの範囲: first=1 count=2")).toEqual(range)
  })
})
