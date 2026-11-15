// 最新のやり取りの最終レポートから段ごとの所要時間を読む `finalPhaseTimesOf`。
import { describe, expect, it } from "vitest"

import { finalPhaseTimesOf } from "../../../../src/browser/domain/main-view/main-view-report-body.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { SETTLED } from "../../../fixture/main-view-entry.ts"
import { ask, finished, report, turnOf } from "../../../fixture/main-view-report.ts"

const plan = (current: number, phaseSummary: string): SessionEvent => ({
  kind: "work-plan",
  delegatedRange: { kind: "none" },
  skippedPhases: [],
  awaitingSummary: { kind: "none" },
  phaseIds: [],
  phases: ["架空の段A", "架空の段B"],
  current,
  finishedInGroup: [],
  phaseSummary,
})

describe("finalPhaseTimesOf", () => {
  it("閉じたやり取りでは、最終レポートの印の付いた本文の所要時間を返す", () => {
    const turn = turnOf(
      [ask, plan(0, ""), plan(1, "架空のまとめ。"), report("架空の結論。"), finished],
      SETTLED,
      true,
    )
    if (turn === undefined) {
      throw new Error("やり取りが無い")
    }

    const times = finalPhaseTimesOf(turn)

    expect(times.kind).toBe("times")
  })

  it("閉じる前は最終レポートの印が無いので none を返す", () => {
    const turn = turnOf(
      [ask, plan(0, ""), plan(1, "架空のまとめ。"), report("架空の結論。")],
      SETTLED,
      false,
    )
    if (turn === undefined) {
      throw new Error("やり取りが無い")
    }

    expect(finalPhaseTimesOf(turn)).toEqual({ kind: "none" })
  })

  it("ワークプランの無いやり取りでは none を返す", () => {
    const turn = turnOf([ask, report("架空の結論。"), finished], SETTLED, true)
    if (turn === undefined) {
      throw new Error("やり取りが無い")
    }

    expect(finalPhaseTimesOf(turn)).toEqual({ kind: "none" })
  })
})
