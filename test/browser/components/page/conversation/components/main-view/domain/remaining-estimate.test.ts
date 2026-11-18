import { describe, expect, it } from "vitest"

import {
  remainingEstimateOf,
  type RemainingEstimate,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/remaining-estimate.ts"
import type { PhaseTimeRow } from "../../../../../../../../src/shared/report/report-phase-time.ts"
import type { MeasuredTime } from "../../../../../../../../src/shared/utils/elapsed-time.ts"

const UNKNOWN = { kind: "unknown" } as const satisfies MeasuredTime

function seconds(value: number): MeasuredTime {
  return { kind: "known", milliseconds: value * 1000 }
}

function phase(duration: MeasuredTime, absence: "none" | "skipped" = "none"): PhaseTimeRow {
  return { kind: "phase", label: "x", start: UNKNOWN, duration, absence }
}

function parallel(wall: MeasuredTime): PhaseTimeRow {
  return { kind: "parallel", label: "x", start: UNKNOWN, wall, absence: "none", phases: [] }
}

function estimate(
  rows: readonly PhaseTimeRow[],
  current: number,
  options: { rangePending?: boolean; shown?: boolean } = {},
): RemainingEstimate {
  return remainingEstimateOf({
    rows,
    current,
    rangePending: options.rangePending ?? false,
    shown: options.shown ?? true,
  })
}

const none = { kind: "none" }

describe("remainingEstimateOf", () => {
  it("済んだ区間が無ければ出さない", () => {
    expect(estimate([phase(seconds(30)), phase(UNKNOWN)], 0)).toEqual(none)
  })

  it("済んだ区間が全部測れていなければ出さない", () => {
    expect(estimate([phase(UNKNOWN), phase(seconds(10)), phase(UNKNOWN)], 1)).toEqual(none)
  })

  it("飛ばしたフェーズを a・b から外す", () => {
    const rows = [phase(UNKNOWN, "skipped"), phase(seconds(120)), phase(seconds(0)), phase(UNKNOWN)]
    expect(estimate(rows, 2)).toEqual({ kind: "shown", low: 4, high: 5 })
  })

  it("範囲が未定なら出さない", () => {
    expect(estimate([phase(seconds(60)), phase(seconds(0))], 1, { rangePending: true })).toEqual(
      none,
    )
  })

  it("作業中でない状態（shown が偽）では出さない", () => {
    expect(estimate([phase(seconds(60)), phase(seconds(0))], 1, { shown: false })).toEqual(none)
  })

  it("今の区間の所要が測れなければ出さない", () => {
    expect(estimate([phase(seconds(60)), phase(UNKNOWN)], 1)).toEqual(none)
  })

  it("current が行の外なら出さない", () => {
    expect(estimate([phase(seconds(60))], 1)).toEqual(none)
  })

  it("端を分に切り上げる（n×a−t が 2.1 分なら 3）", () => {
    // n=3, a=b=42秒 → 2.1 分
    expect(
      estimate([phase(seconds(42)), phase(seconds(0)), phase(UNKNOWN), phase(UNKNOWN)], 1),
    ).toEqual({ kind: "shown", low: 3, high: 4 })
  })

  it("下の端は 1 分未満にならない", () => {
    expect(estimate([phase(seconds(6)), phase(seconds(0)), phase(UNKNOWN)], 1)).toEqual({
      kind: "shown",
      low: 1,
      high: 2,
    })
  })

  it("最短と最長が同じなら上の端は下の端より 1 大きい", () => {
    expect(
      estimate([phase(seconds(120)), phase(seconds(120)), phase(seconds(0)), phase(UNKNOWN)], 2),
    ).toEqual({ kind: "shown", low: 4, high: 5 })
  })

  it("最短と最長が違えば幅になる", () => {
    expect(
      estimate([phase(seconds(60)), phase(seconds(180)), phase(seconds(0)), phase(UNKNOWN)], 2),
    ).toEqual({ kind: "shown", low: 2, high: 6 })
  })

  it("今の区間の経過が n×b を超えても 1〜2 に収まる", () => {
    expect(estimate([phase(seconds(60)), phase(seconds(600))], 1)).toEqual({
      kind: "shown",
      low: 1,
      high: 2,
    })
  })

  it("今の区間の経過は分に切り捨てる（1分00秒と1分59秒で同じ、2分00秒で変わる）", () => {
    const at = (elapsed: number) =>
      estimate([phase(seconds(300)), phase(seconds(elapsed)), phase(UNKNOWN)], 1)
    expect(at(60)).toEqual({ kind: "shown", low: 9, high: 10 })
    expect(at(119)).toEqual(at(60))
    expect(at(120)).toEqual({ kind: "shown", low: 8, high: 9 })
  })

  it("並列の区間は壁時計の所要を使う", () => {
    expect(estimate([parallel(seconds(120)), phase(seconds(0))], 1)).toEqual({
      kind: "shown",
      low: 2,
      high: 3,
    })
  })
})
