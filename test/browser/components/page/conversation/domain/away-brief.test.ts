import { describe, expect, it } from "vitest"

import {
  AWAY_MIN_MS,
  type AwayBriefSource,
  awayBriefOf,
} from "../../../../../../src/browser/components/page/conversation/domain/away-brief.ts"
import { phaseRecapsOf } from "../../../../../../src/browser/components/page/conversation/domain/phase-recap.ts"
import {
  NO_ASK,
  type WorkPlanAsk,
} from "../../../../../../src/browser/components/page/conversation/domain/work-plan-ask-row.ts"
import {
  rowsOfSlot,
  workPlanSlotsOf,
} from "../../../../../../src/browser/components/page/conversation/domain/work-plan-row.ts"
import type { SessionRecord } from "../../../../../../src/shared/session/session-record.ts"
import { workPlanOf } from "../../../../../../src/shared/session/work-plan-fold.ts"
import {
  EMPTY_WORK_PLAN_TRAIL,
  type WorkPlanTrail,
} from "../../../../../../src/shared/session/work-plan-trail.ts"
import type { WorkPlan } from "../../../../../../src/shared/session/work-plan.ts"
import { NO_USUAL_DURATIONS } from "../../../../../../src/shared/usage/usual-duration.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>

const PHASES = ["架空の調べ", "架空の実装", "架空の検証", "架空の仕上げ"]

const AWAY_23_MINUTES = 23 * 60 * 1000

const ASKED = {
  kind: "asked",
  question: "架空の問い？",
  material: "架空の材料",
  askedAt: 0,
} as const satisfies WorkPlanAsk

function record(
  current: number,
  overrides: Partial<WorkPlan> = {},
  second = current,
): WorkPlanRecord {
  return {
    kind: "work-plan",
    time: { kind: "stamped", at: second * 1000 },
    phases: PHASES,
    phaseIds: [],
    current,
    finishedInGroup: [],
    phaseSummary: current === 0 ? "" : `架空のまとめ${String(current)}`,
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    ...overrides,
  }
}

/** 隠れた時点で `seenCount` 件を見ていて、今は `plans` を持つときの材料。 */
function sourceOf(
  plans: readonly WorkPlanRecord[],
  seenCount: number,
  extra: Partial<AwayBriefSource> = {},
): AwayBriefSource {
  const trail: WorkPlanTrail = { ...EMPTY_WORK_PLAN_TRAIL, plans }
  const last = plans.at(-1)
  const [first] = plans
  if (last === undefined || first === undefined) {
    throw new Error("記録が要る")
  }
  const plan = workPlanOf(last)
  const rows = workPlanSlotsOf({
    plan,
    recaps: phaseRecapsOf(trail, { kind: "stamped", at: 100_000 }),
    steps: [],
    delegates: [],
    usual: NO_USUAL_DURATIONS,
    asks: [],
  }).flatMap(rowsOfSlot)
  return {
    awayMs: AWAY_23_MINUTES,
    seen: { count: seenCount, first },
    plan,
    trail,
    rows,
    ask: NO_ASK,
    ...extra,
  }
}

const THREE_DONE = [record(0), record(1), record(2), record(3)]

describe("awayBriefOf", () => {
  it("3 分に満たなければ出さない", () => {
    const brief = awayBriefOf(sourceOf(THREE_DONE, 1, { awayMs: AWAY_MIN_MS - 1 }))

    expect(brief).toEqual({ kind: "none" })
  })

  it("ちょうど 3 分なら出す", () => {
    const brief = awayBriefOf(sourceOf(THREE_DONE, 1, { awayMs: AWAY_MIN_MS }))

    expect(brief.kind).toBe("brief")
  })

  it("計画が無ければ出さない", () => {
    const brief = awayBriefOf(sourceOf(THREE_DONE, 1, { plan: { kind: "none" } }))

    expect(brief).toEqual({ kind: "none" })
  })

  it("最初の記録が隠れた時点と違えば、依頼が替わったので出さない", () => {
    const brief = awayBriefOf(
      sourceOf(THREE_DONE, 1, { seen: { count: 1, first: record(0, {}, 99) } }),
    )

    expect(brief).toEqual({ kind: "none" })
  })

  it("記録が隠れた時点より少なければ、依頼が替わったので出さない", () => {
    const brief = awayBriefOf(sourceOf([record(0)], 2))

    expect(brief).toEqual({ kind: "none" })
  })

  it("印より後に何も無く問いも無ければ出さない", () => {
    const brief = awayBriefOf(sourceOf(THREE_DONE, 4))

    expect(brief).toEqual({ kind: "none" })
  })

  it("段が済んだら、済んだ段を並べ、印をその最初の行の前に引く", () => {
    const brief = awayBriefOf(sourceOf(THREE_DONE, 2))

    expect(brief).toMatchObject({
      kind: "brief",
      minutes: 23,
      total: 4,
      settled: 3,
      changes: [
        { title: "架空の実装", summary: "架空のまとめ2", touched: 0 },
        { title: "架空の検証", summary: "架空のまとめ3", touched: 0 },
      ],
      replans: [],
      markBeforeRowKey: { kind: "row", key: "架空の実装\u00000" },
    })
  })

  it("問いだけなら出し、印を今の行の前に引く", () => {
    const brief = awayBriefOf(sourceOf(THREE_DONE, 4, { ask: ASKED }))

    expect(brief).toMatchObject({
      kind: "brief",
      waiting: ASKED,
      changes: [],
      markBeforeRowKey: { kind: "row", key: "架空の仕上げ\u00000" },
    })
  })

  it("前提は印より後に増えた分だけ並べる", () => {
    const plans = [
      record(0, { assumptions: ["架空の前提A"] }),
      record(1, { assumptions: ["架空の前提A", "架空の前提B"] }),
    ]

    const brief = awayBriefOf(sourceOf(plans, 1))

    expect(brief).toMatchObject({ kind: "brief", assumptions: ["架空の前提B"] })
  })

  it("計画を直した理由を、印より後のものだけ重ねずに並べる", () => {
    const plans = [
      record(0, { replanReason: "架空の前の理由" }),
      record(1, { replanReason: "架空の理由" }),
      record(2, { replanReason: "架空の理由" }),
    ]

    const brief = awayBriefOf(sourceOf(plans, 1))

    expect(brief).toMatchObject({ kind: "brief", replans: ["架空の理由"] })
  })

  it("段が全部済んだら、印は引かない", () => {
    const brief = awayBriefOf(sourceOf([...THREE_DONE, record(4, { phaseSummary: "" })], 2))

    expect(brief).toMatchObject({ kind: "brief", settled: 4, markBeforeRowKey: { kind: "none" } })
  })
})
