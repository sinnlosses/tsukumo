import { describe, expect, it } from "vitest"

import type { DelegateReturn } from "../../../src/shared/session/delegate-return.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import {
  currentWorkPlan,
  nextWorkPlan,
  phaseFinishedByReturn,
  type WorkPlanEvent,
} from "../../../src/shared/session/work-plan-fold.ts"
import type {
  LatestWorkPlan,
  WorkPlan,
  WorkPlanEntry,
} from "../../../src/shared/session/work-plan.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { next, PHASES, planned } from "../../fixture/work-plan-draft.ts"
import { WORK_PLAN_SCENES } from "../../fixture/work-plan-scene.ts"

describe("nextWorkPlan（finished の report で閉じる）", () => {
  const closed = (plan: WorkPlan): LatestWorkPlan =>
    nextWorkPlan({ kind: "planned", ...plan }, reportEvent({ workPlanClosing: "finished" }))

  it("最後の段にいれば、段の並びはそのままで全部の段を終えた位置にする", () => {
    expect(closed(next(PHASES, 2, "架空のまとめ。"))).toEqual({
      kind: "planned",
      ...next(PHASES, 3),
    })
  })

  it("段が2つ以上残っている・全部済みの位置からは動かさない", () => {
    expect(closed(next(PHASES, 1, "架空のまとめ。"))).toEqual({
      kind: "planned",
      ...next(PHASES, 1, "架空のまとめ。"),
    })
    expect(closed(next(PHASES, 3))).toEqual({ kind: "planned", ...next(PHASES, 3) })
  })

  it("最後の並列の段は、残りが1段になってから閉じる", () => {
    const group = ["架空の段A", ["架空の段B", "架空の段C"]] as const

    expect(closed(next(group, 1, "架空のまとめ。"))).toEqual({
      kind: "planned",
      ...next(group, 1, "架空のまとめ。"),
    })
    expect(closed(next(group, 1, "架空のまとめ。", ["架空の段B"]))).toEqual({
      kind: "planned",
      ...next(group, 2),
    })
  })
})

describe("nextWorkPlan（委譲の返却で進める）", () => {
  const RANGE = { kind: "range", first: 1, count: 2 } as const
  const SERIAL: readonly WorkPlanEntry[] = [
    "架空の計画",
    "架空の実装A",
    "架空の実装B",
    "架空の受け入れ",
  ]
  const planAt = (
    current: number,
    phases: readonly WorkPlanEntry[] = SERIAL,
    finishedInGroup: readonly string[] = [],
    delegatedRange: WorkPlan["delegatedRange"] = RANGE,
  ): LatestWorkPlan => ({
    kind: "planned",
    phases,
    current,
    finishedInGroup,
    phaseSummary: "",
    delegatedRange,
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
  })
  const phaseDone = (phase: number, count = 2, summary = "架空の要約。"): DelegateReturn => ({
    kind: "phase-done",
    phase,
    count,
    summary,
  })
  const returned = (plan: LatestWorkPlan, handback: DelegateReturn): LatestWorkPlan =>
    nextWorkPlan(plan, { kind: "delegate-returned", handback })

  it("phase-done で、phase に当たる今の段を済ませ、要約を段のまとめにする", () => {
    expect(returned(planAt(1), phaseDone(1))).toEqual({
      ...planAt(2),
      phaseSummary: "架空の要約。",
    })
    expect(returned(planAt(2), phaseDone(2))).toEqual({
      ...planAt(3),
      phaseSummary: "架空の要約。",
    })
  })

  it("要約は2文に切り詰める", () => {
    expect(returned(planAt(1), phaseDone(1, 2, "一つ目。二つ目。三つ目。"))).toMatchObject({
      phaseSummary: "一つ目。二つ目。",
    })
  })

  it("並列の段の中の段は finishedInGroup に足し、最後の段で current を進めて空にする", () => {
    const grouped: readonly WorkPlanEntry[] = [
      "架空の計画",
      ["架空の実装A", "架空の実装B"],
      "架空の受け入れ",
    ]

    expect(returned(planAt(1, grouped), phaseDone(2))).toMatchObject({
      current: 1,
      finishedInGroup: ["架空の実装B"],
    })
    expect(returned(planAt(1, grouped, ["架空の実装B"]), phaseDone(1))).toMatchObject({
      current: 2,
      finishedInGroup: [],
    })
  })

  it("一足飛び・済んだ段・N の食い違いは動かさない", () => {
    expect(returned(planAt(1), phaseDone(2))).toEqual(planAt(1))
    expect(returned(planAt(2), phaseDone(1))).toEqual(planAt(2))
    expect(returned(planAt(1), phaseDone(1, 3))).toEqual(planAt(1))
  })

  it("範囲の無いワークプランと、止めた返却は動かさない", () => {
    const noRange = planAt(1, SERIAL, [], { kind: "none" })

    expect(returned(noRange, phaseDone(1))).toEqual(noRange)
    expect(returned(planAt(1), { kind: "stopped", phase: 1, count: 2, summary: "架空" })).toEqual(
      planAt(1),
    )
  })

  it("並びの最後の段は返却では済ませない（閉じるのは report）", () => {
    const lastPhase = planAt(1, ["架空の段A", "架空の段B"], [], {
      kind: "range",
      first: 0,
      count: 2,
    })

    expect(returned(lastPhase, phaseDone(2))).toEqual(lastPhase)
  })

  it("phase-skipped は段を済ませて飛ばした段に名前を足し、まとめ待ちにする", () => {
    const skipped = { kind: "phase-skipped", phase: 1, count: 2 } as const

    expect(returned(planAt(1), skipped)).toEqual({
      ...planAt(2),
      skippedPhases: ["架空の実装A"],
      awaitingSummary: { kind: "awaiting", key: "架空の実装A\u00000" },
    })
  })

  it("要約の空の phase-done はまとめ待ちにし、要約があればまとめ待ちにしない", () => {
    expect(returned(planAt(1), phaseDone(1, 2, ""))).toMatchObject({
      current: 2,
      phaseSummary: "",
      skippedPhases: [],
      awaitingSummary: { kind: "awaiting", key: "架空の実装A\u00000" },
    })
    expect(returned(planAt(1), phaseDone(1))).toMatchObject({ awaitingSummary: { kind: "none" } })
  })

  it("phase-skipped も一足飛び・済んだ段・N の食い違い・範囲の無いワークプランでは動かさず、印も付けない", () => {
    const skipped = (phase: number, count = 2) => ({ kind: "phase-skipped", phase, count }) as const
    const noRange = planAt(1, SERIAL, [], { kind: "none" })
    const pending = planAt(1, SERIAL, [], { kind: "pending", first: 1 })

    expect(returned(planAt(1), skipped(2))).toEqual(planAt(1))
    expect(returned(planAt(2), skipped(1))).toEqual(planAt(2))
    expect(returned(planAt(1), skipped(1, 3))).toEqual(planAt(1))
    expect(returned(noRange, skipped(1))).toEqual(noRange)
    expect(returned(pending, skipped(1))).toEqual(pending)
  })

  it("phaseFinishedByReturn は返却で済む帯の段を返し、帯を動かさない返却では unmoved", () => {
    const serial = next(SERIAL, 1)
    const ranged: WorkPlan = { ...serial, delegatedRange: RANGE }
    const UNMOVED = { kind: "unmoved" }

    expect(phaseFinishedByReturn(ranged, phaseDone(1))).toMatchObject({
      kind: "finished",
      phase: { index: 1, name: "架空の実装A" },
    })
    expect(phaseFinishedByReturn(ranged, phaseDone(2))).toEqual(UNMOVED)
    expect(phaseFinishedByReturn(serial, phaseDone(1))).toEqual(UNMOVED)
    expect(
      phaseFinishedByReturn(
        {
          ...next(["架空の段A", "架空の段B"], 1),
          delegatedRange: { kind: "range", first: 0, count: 2 },
        },
        phaseDone(2),
      ),
    ).toEqual(UNMOVED)
    expect(
      phaseFinishedByReturn(ranged, { kind: "stopped", phase: 1, count: 2, summary: "架空" }),
    ).toEqual(UNMOVED)
  })
})

describe("nextWorkPlan（範囲を初めて宣言した work-plan）", () => {
  const SERIAL: readonly WorkPlanEntry[] = [
    "架空の計画",
    "架空の実装A",
    "架空の実装B",
    "架空の受け入れ",
  ]
  const range = { kind: "range", first: 1, count: 2 } as const
  const declared = (current: number): WorkPlan => ({
    phases: SERIAL,
    current,
    finishedInGroup: [],
    phaseSummary: "架空の計画を書いた。",
    delegatedRange: range,
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
  })
  const event = (plan: WorkPlan): WorkPlanEvent => ({ kind: "work-plan", ...plan })

  it("pending のあいだは位置を動かさず、返却でも動かない。count 付きで宣言した最初の呼び出しで範囲の前の段を済ませる", () => {
    const pending = { kind: "pending", first: 1 } as const
    const plan = nextWorkPlan(
      planned(SERIAL, 0),
      event({ ...declared(0), delegatedRange: pending }),
    )
    expect(plan).toMatchObject({ current: 0, delegatedRange: pending })
    expect(
      nextWorkPlan(plan, {
        kind: "delegate-returned",
        handback: { kind: "phase-done", phase: 1, count: 2, summary: "架空" },
      }),
    ).toEqual(plan)
    expect(nextWorkPlan(plan, event(declared(0)))).toMatchObject({ current: 1 })
  })

  it("範囲の前の段を済ませ、範囲の先頭の段を今の段にする", () => {
    const plan = nextWorkPlan(planned(SERIAL, 0), event(declared(0)))
    expect(plan).toMatchObject({ current: 1 })
    expect(
      nextWorkPlan(plan, {
        kind: "delegate-returned",
        handback: { kind: "phase-done", phase: 1, count: 2, summary: "架空" },
      }),
    ).toMatchObject({ current: 2 })
  })

  it("範囲を宣言済みなら位置を動かさない", () => {
    const before = nextWorkPlan(planned(SERIAL, 0), event(declared(0)))
    expect(nextWorkPlan(before, event(declared(0)))).toMatchObject({ current: 0 })
  })
})

describe("イベントの並びから畳んだ今のワークプラン", () => {
  const isWorkPlanEvent = (event: SessionEvent): event is WorkPlanEvent =>
    event.kind === "request" ||
    event.kind === "work-plan" ||
    event.kind === "delegate-returned" ||
    event.kind === "report"
  const foldedPlanAfter = (events: readonly SessionEvent[]): LatestWorkPlan =>
    events.reduce<LatestWorkPlan>(
      (plan, event) => (isWorkPlanEvent(event) ? nextWorkPlan(plan, event) : plan),
      { kind: "none" },
    )
  const recordedPlanAfter = (events: readonly SessionEvent[]): LatestWorkPlan =>
    currentWorkPlan(
      events.reduce((state, event) => applySessionEvent(state, event, 0), INITIAL_SESSION_STATE)
        .records,
    )

  it.each(WORK_PLAN_SCENES)("$name", ({ events, plan }) => {
    expect(foldedPlanAfter(events)).toEqual(plan)
    expect(recordedPlanAfter(events)).toEqual(plan)
  })
})
