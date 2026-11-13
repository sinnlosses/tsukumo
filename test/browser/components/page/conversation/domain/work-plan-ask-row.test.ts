import { describe, expect, it } from "vitest"

import { askOf } from "../../../../../../src/browser/components/page/conversation/domain/work-plan-ask-row.ts"
import {
  rowsOfSlot,
  workPlanSlotsOf,
} from "../../../../../../src/browser/components/page/conversation/domain/work-plan-row.ts"
import type { StampedPendingAsk } from "../../../../../../src/shared/session-driver/pending-ask.ts"
import type { PlannedWorkPlan } from "../../../../../../src/shared/session/work-plan.ts"
import { NO_USUAL_DURATIONS } from "../../../../../../src/shared/usage/usual-duration.ts"

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

const QUESTION: StampedPendingAsk = {
  kind: "question",
  id: "q1",
  questions: [{ header: "架空の見出し", text: "架空の質問？", multiSelect: false, options: [] }],
  briefs: [
    {
      header: "架空の見出し",
      whyAsk: "架空の訊く理由",
      facts: [{ text: "架空の事実", basis: "checked" }],
      options: [],
    },
  ],
  imageSizes: [],
  unshelvedImages: [],
  askedAt: 100,
}

const PERMISSION: StampedPendingAsk = {
  kind: "permission",
  id: "p1",
  toolName: "Bash",
  input: {},
  askedAt: 100,
}

function asksOfRows(asks: readonly StampedPendingAsk[]) {
  return workPlanSlotsOf({
    plan: PLAN,
    recaps: new Map(),
    steps: [],
    delegates: [],
    usual: NO_USUAL_DURATIONS,
    asks,
  })
    .flatMap(rowsOfSlot)
    .map((row) => row.ask.kind)
}

describe("段の行の問い", () => {
  it("問いは今の段の行だけに付く", () => {
    expect(asksOfRows([QUESTION])).toEqual(["none", "asked", "none"])
  })

  it("許可要求は段に出さない", () => {
    expect(asksOfRows([PERMISSION])).toEqual(["none", "none", "none"])
  })

  it("材料は同じ見出しの添え書きの事実の先頭、無ければ訊く理由になる", () => {
    expect(askOf([QUESTION])).toEqual({
      kind: "asked",
      question: "架空の質問？",
      material: "架空の事実",
      askedAt: 100,
    })
    expect(askOf([{ ...QUESTION, briefs: [] }])).toMatchObject({ material: "" })
    const [brief] = QUESTION.kind === "question" ? QUESTION.briefs : []
    const withoutFacts = {
      ...QUESTION,
      briefs: brief === undefined ? [] : [{ ...brief, facts: [] }],
    }
    expect(askOf([withoutFacts])).toMatchObject({ material: "架空の訊く理由" })
  })
})
