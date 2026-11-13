import { describe, expect, it } from "vitest"

import {
  remainingEstimate,
  usualRangeText,
} from "../../../../../../src/browser/components/page/conversation/domain/usual-duration.ts"
import { workPlanSlotsOf } from "../../../../../../src/browser/components/page/conversation/domain/work-plan-row.ts"
import type { PlannedWorkPlan } from "../../../../../../src/shared/session/work-plan.ts"
import {
  NO_USUAL_DURATIONS,
  type UsualDurations,
  type UsualSpread,
} from "../../../../../../src/shared/usage/usual-duration.ts"

const PLAN: PlannedWorkPlan = {
  kind: "planned",
  phases: ["架空の調べ", "架空の実装", "架空の検証"],
  phaseIds: [],
  current: 1,
  finishedInGroup: [],
  phaseSummary: "",
  delegatedRange: { kind: "none" },
  skippedPhases: [],
  awaitingSummary: { kind: "none" },
}

/** 件数 `count` の塊。5 件に満たなければ、サーバと同じく `empty` にする。 */
function spread(count: number, medianSeconds: number): UsualSpread {
  return count < 5
    ? { kind: "empty", count }
    : { kind: "measured", count, medianSeconds, lowSeconds: 120, highSeconds: 240 }
}

function usualWith(whole: UsualSpread): UsualDurations {
  return { ...NO_USUAL_DURATIONS, phases: { ...NO_USUAL_DURATIONS.phases, whole } }
}

function rowsOf(usual: UsualDurations) {
  return workPlanSlotsOf({
    plan: PLAN,
    recaps: new Map(),
    steps: [],
    delegates: [],
    usual,
    asks: [],
  }).flatMap((slot) => (slot.kind === "phase" ? [slot.row] : slot.rows))
}

describe("見込みと幅", () => {
  it("似た段が 4 件しかなければ、見込みも幅も出さない", () => {
    const usual = usualWith(spread(4, 120))

    expect(remainingEstimate(PLAN, rowsOf(usual), usual)).toEqual({ kind: "none" })
    expect(rowsOf(usual).map((row) => row.usual)).toEqual([
      { kind: "none" },
      { kind: "none" },
      { kind: "none" },
    ])
  })

  it("5 件あれば、残りの段の中央値の和を「約」と件数つきで出し、これからの段に幅を出す", () => {
    const usual = usualWith(spread(5, 120))

    expect(remainingEstimate(PLAN, rowsOf(usual), usual)).toEqual({
      kind: "shown",
      text: "あと約 4分（似た段 5 件の中央値から）",
    })
    expect(rowsOf(usual).map((row) => row.usual)).toEqual([
      { kind: "none" },
      { kind: "none" },
      { kind: "shown", text: "似た作業では 2〜4分" },
    ])
  })

  it("今の段は経った分を引いて数える", () => {
    const usual = usualWith(spread(9, 180))
    const rows = rowsOf(usual).map((row) =>
      row.state === "current"
        ? { ...row, duration: { kind: "known", milliseconds: 120_000 } as const }
        : row,
    )

    expect(remainingEstimate(PLAN, rows, usual)).toEqual({
      kind: "shown",
      text: "あと約 4分（似た段 9 件の中央値から）",
    })
  })

  it("幅の両端が同じ分なら「約」1つで言う", () => {
    expect(
      usualRangeText({
        kind: "measured",
        count: 5,
        medianSeconds: 60,
        lowSeconds: 50,
        highSeconds: 70,
      }),
    ).toEqual({ kind: "shown", text: "似た作業では約 1分" })
  })
})
