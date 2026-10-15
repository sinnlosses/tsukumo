import { describe, expect, it } from "vitest"

import {
  bandPositionText,
  handbackLineText,
  handbackNoteText,
} from "../../../../src/server/session-driver/core/band-position.ts"
import { parseDelegateReturn } from "../../../../src/shared/session/delegate-return.ts"
import { workPlanOf } from "../../../../src/shared/session/work-plan.ts"

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
  it("段取りが無ければ空", () => {
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

describe("handbackLineText", () => {
  const RANGED = planned({ delegatedRange: { kind: "range", first: 1, count: 3 } })

  it("今の段に当たる段 n/N の返却は、済んだ帯の段の位置と名前を言う", () => {
    expect(handbackLineText(RANGED, parseDelegateReturn("段 2/3 | 架空の返却。"))).toBe(
      "返却 `段 2/3` で帯の 本 2/3 実装B が済んだ。",
    )
  })

  it("飛ばした段の返却は、飛ばした段の番号で言う", () => {
    expect(handbackLineText(RANGED, { kind: "phase-skipped", phase: 2, count: 3 })).toBe(
      "返却 `飛ばした 2/3` で帯の 本 2/3 実装B が済んだ。",
    )
  })

  it("済んだ段・一足飛び・並びの最後の段に当たる返却では、帯が動いていないと言う", () => {
    expect(handbackLineText(RANGED, parseDelegateReturn("段 1/3 | 架空の済んだ段。"))).toBe(
      "返却 `段 1/3` では帯は動いていない。",
    )
    expect(handbackLineText(RANGED, parseDelegateReturn("段 3/3 | 架空の一足飛び。"))).toBe(
      "返却 `段 3/3` では帯は動いていない。",
    )
    const last = planned({ current: 4, delegatedRange: { kind: "range", first: 4, count: 1 } })
    expect(handbackLineText(last, parseDelegateReturn("段 1/1 | 架空の最後の段。"))).toBe(
      "返却 `段 1/1` では帯は動いていない。",
    )
  })

  it("範囲が無い・N が範囲の段の数と違う返却では、帯が動いていないと言う", () => {
    expect(handbackLineText(planned({}), parseDelegateReturn("段 1/3 | 架空の返却。"))).toBe(
      "返却 `段 1/3` では帯は動いていない。",
    )
    expect(handbackLineText(RANGED, parseDelegateReturn("段 2/4 | 架空の返却。"))).toBe(
      "返却 `段 2/4` では帯は動いていない。",
    )
  })

  it("計画・止めた・読めない返却では、帯が動いていないことを言う", () => {
    expect(handbackLineText(RANGED, parseDelegateReturn("計画 0/3 | 架空の計画。"))).toBe(
      "返却 `計画 0/3` は段に数えず、帯は動いていない。",
    )
    expect(handbackLineText(RANGED, parseDelegateReturn("止めた 2/3 | 架空の理由。"))).toBe(
      "返却 `止めた 2/3` では帯は動いていない。",
    )
    expect(handbackLineText(RANGED, parseDelegateReturn("了解しました"))).toBe(
      "返却の1行目が契約の形でなく、帯は動いていない。",
    )
  })
})

describe("handbackNoteText", () => {
  it("行が無いか段取りが無ければ空", () => {
    expect(handbackNoteText([], planned({}))).toBe("")
    expect(handbackNoteText(["架空の行。"], { kind: "none" })).toBe("")
  })

  it("注記の頭・返却ごとの行・帯の位置の文を1回だけ、この順に並べる", () => {
    expect(handbackNoteText(["架空の行1。", "架空の行2。"], planned({}))).toBe(
      "tsukumo の注記（委譲先の返却の本文ではない）:架空の行1。架空の行2。帯の今の段は 3/5 実装B。",
    )
  })
})
