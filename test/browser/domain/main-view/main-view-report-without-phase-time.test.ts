// `withoutPhaseTimes` は段ごとの所要時間だけを消す。
import { describe, expect, it } from "vitest"

import { withoutPhaseTimes } from "../../../../src/browser/domain/main-view/main-view-report-body.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { headOf, SETTLED } from "../../../fixture/main-view-entry.ts"
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

describe("withoutPhaseTimes", () => {
  it("markdown の本文はそのまま返す", () => {
    const body = { kind: "markdown", markdown: "架空の本文" } as const

    expect(withoutPhaseTimes(body)).toBe(body)
  })

  it("面の本文は所要時間だけを none にして、変えたファイルと検証の欄を残す", () => {
    const turn = turnOf(
      [ask, plan(0, ""), plan(1, "架空のまとめ。"), report("架空の結論。"), finished],
      SETTLED,
      true,
    )
    const final = turn?.steps.find((step) => step.mark === "final")?.body
    const body = final?.kind === "text" ? final.report : undefined
    if (body === undefined) {
      throw new Error("最終レポートが無い")
    }
    const before = headOf(body)

    const after = headOf(withoutPhaseTimes(body))

    expect(before?.status.phaseTimes.kind).toBe("times")
    expect(after?.status.phaseTimes).toEqual({ kind: "none" })
    expect(after?.status.changedFiles).toEqual(before?.status.changedFiles)
    expect(after?.status.verification).toEqual(before?.status.verification)
    expect(after?.finalStatus).toEqual(before?.finalStatus)
  })
})
