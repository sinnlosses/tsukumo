import { describe, expect, it } from "vitest"

import { applyRestoredEvents } from "../../../src/server/session/core/restored-event.ts"
import type { DelegateReturn } from "../../../src/shared/session/delegate-return.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { currentWorkPlan } from "../../../src/shared/session/work-plan-fold.ts"
import type { WorkPlan, WorkPlanClosing } from "../../../src/shared/session/work-plan.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"
import { apply } from "../../fixture/session-state.ts"

describe("applySessionEvent（委譲とワークプラン）", () => {
  const request = requestEvent()
  const PHASES = ["架空の計画", "架空の段1", "架空の段2", "架空の受け入れ"]
  const mainPlan = (current: number, phaseSummary = ""): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phases: PHASES,
    current,
    finishedInGroup: [],
    phaseSummary,
  })
  const currentOf = (state: SessionState) => {
    const plan = currentWorkPlan(state.records)
    return plan.kind === "planned" ? plan.current : undefined
  }

  it("委譲先の途中の合図（SendMessage）・返却（SubagentHandback）とバックグラウンドタスクの顔ぶれの変化では、帯は動かない", () => {
    const before = apply(request, mainPlan(1, "架空のまとめ。"))
    const after = apply(
      request,
      mainPlan(1, "架空のまとめ。"),
      {
        kind: "tool-started",
        toolUseId: "toolu_send",
        name: "SendMessage",
        input: { to: "main", message: "状況 | 2/3 | 架空" },
        parentToolUseId: "toolu_sub",
      },
      {
        kind: "tool-started",
        toolUseId: "toolu_handback",
        name: "SubagentHandback",
        input: { message: "段 2/2 | 架空の返却。" },
        parentToolUseId: "toolu_sub",
      },
      { kind: "background-tasks-changed", tasks: [] },
    )

    expect(currentOf(after)).toBe(currentOf(before))
  })
})

describe("applySessionEvent（委譲の返却で進むワークプラン）", () => {
  const request = requestEvent()
  const PHASES = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]
  const plan = (current: number, delegatedRange: WorkPlan["delegatedRange"]): SessionEvent => ({
    kind: "work-plan",
    phases: PHASES,
    current,
    finishedInGroup: [],
    phaseSummary: current > 0 ? "架空のまとめ。" : "",
    delegatedRange,
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
  })
  const RANGE = { kind: "range", first: 1, count: 2 } as const
  const returned = (handback: DelegateReturn): SessionEvent => ({
    kind: "delegate-returned",
    handback,
  })
  const done = (phase: number, summary = "架空の要約。"): DelegateReturn => ({
    kind: "phase-done",
    phase,
    count: 2,
    summary,
  })

  it("返却の届いた時刻で、段を済ませたワークプランの記録を積む", () => {
    const planned = applySessionEvent(
      applySessionEvent(INITIAL_SESSION_STATE, request, 1_000),
      plan(1, RANGE),
      2_000,
    )

    const state = applySessionEvent(planned, returned(done(1)), 9_000)

    expect(state.records.at(-1)).toMatchObject({
      kind: "work-plan",
      current: 2,
      phaseSummary: "架空の要約。",
      delegatedRange: RANGE,
      time: { kind: "stamped", at: 9_000 },
    })
  })

  it("メインが work_plan を呼ばなくても返却ごとに進み、同じ返却をもう一度受けても記録を足さない", () => {
    const state = [plan(1, RANGE), returned(done(1)), returned(done(1)), returned(done(2))].reduce(
      (view, event) => applySessionEvent(view, event, 0),
      applySessionEvent(INITIAL_SESSION_STATE, request, 0),
    )

    expect(state.records.filter((record) => record.kind === "work-plan")).toHaveLength(3)
    expect(currentWorkPlan(state.records)).toMatchObject({ current: 3 })
  })

  it.each([
    ["一足飛び", done(2)],
    ["止めた", { kind: "stopped", phase: 1, count: 2, summary: "架空" } as const],
  ])("%s は帯を動かさない", (_, handback) => {
    const planned = [request, plan(1, RANGE)].reduce(
      (view, event) => applySessionEvent(view, event, 0),
      INITIAL_SESSION_STATE,
    )

    expect(applySessionEvent(planned, returned(handback), 5_000)).toEqual(planned)
  })

  it("範囲の無いワークプランと、ワークプランの無い依頼では動かさない", () => {
    const noRange = apply(request, plan(1, { kind: "none" }))

    expect(applySessionEvent(noRange, returned(done(1)), 5_000)).toEqual(noRange)
    expect(applySessionEvent(apply(request), returned(done(1)), 5_000)).toEqual(apply(request))
  })

  it("前の依頼のワークプランは進めない", () => {
    const state = apply(request, plan(1, RANGE), request)

    expect(applySessionEvent(state, returned(done(1)), 5_000)).toEqual(state)
  })
})

describe("applySessionEvent（report の段の閉じ方とワークプラン）", () => {
  const request = requestEvent()
  const PHASES = ["架空の段A", "架空の段B", "架空の段C"]
  const mainPlan = (current: number): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phases: PHASES,
    current,
    finishedInGroup: [],
    phaseSummary: current > 0 && current < PHASES.length ? "架空のまとめ。" : "",
  })
  const reportOf = (workPlanClosing: WorkPlanClosing): SessionEvent =>
    reportEvent({ toolUseId: "toolu_r1", workPlanClosing })
  const currentPlan = (state: SessionState) => currentWorkPlan(state.records)

  it("最後の段で finished の report を受けると、帯が全部済みになる", () => {
    const state = apply(request, mainPlan(2), reportOf("finished"))

    expect(currentPlan(state)).toEqual({
      kind: "planned",
      phases: PHASES,
      current: PHASES.length,
      finishedInGroup: [],
      phaseSummary: "",
      delegatedRange: { kind: "none" },
      skippedPhases: [],
      awaitingSummary: { kind: "none" },
    })
    expect(state.records.at(-1)?.kind).toBe("report")
  })

  it("stopped の report では、帯は今の段のまま残る", () => {
    const state = apply(request, mainPlan(2), reportOf("stopped"))

    expect(currentPlan(state)).toMatchObject({ current: 2 })
  })

  it("段が2つ以上残っていれば、finished でも帯は動かない", () => {
    const state = apply(request, mainPlan(1), reportOf("finished"))

    expect(currentPlan(state)).toMatchObject({ current: 1 })
  })

  it("ワークプランの無い依頼と、前の依頼のワークプランには何も積まない", () => {
    const none = apply(request, reportOf("finished"))
    const previous = apply(request, mainPlan(2), request, reportOf("finished"))

    expect(none.records.filter((record) => record.kind === "work-plan")).toEqual([])
    expect(previous.records.filter((record) => record.kind === "work-plan")).toHaveLength(1)
  })
})

describe("applySessionEvent（ワークプランとレポートの時刻）", () => {
  const request = requestEvent()
  const mainPlan = (current: number): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phases: ["架空の計画", "架空の実装", "架空の受け入れ"],
    current,
    finishedInGroup: [],
    phaseSummary: current > 0 && current < 3 ? "架空のまとめ。" : "",
  })
  const report: SessionEvent = reportEvent({ toolUseId: "toolu_r1" })
  const applyAt = (...stamped: readonly (readonly [SessionEvent, number])[]): SessionState =>
    stamped.reduce(
      (state, [event, at]) => applySessionEvent(state, event, at),
      INITIAL_SESSION_STATE,
    )
  const timesOf = (state: SessionState) =>
    state.records.flatMap((record) =>
      record.kind === "work-plan" || record.kind === "report" ? [record.time] : [],
    )

  it("work-plan・report の記録は、届いた時刻を持つ", () => {
    const state = applyAt([request, 0], [mainPlan(0), 1000], [mainPlan(1), 2000], [report, 3000])

    expect(timesOf(state)).toEqual([
      { kind: "stamped", at: 1000 },
      { kind: "stamped", at: 2000 },
      { kind: "stamped", at: 3000 },
    ])
  })

  it("復元したワークプランとレポートは、読めた時刻の recovered になり、読めなければ restored になる", () => {
    const events = [request, mainPlan(0), report]
    const withTime = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      events.map((event, index) => ({ event, time: { kind: "known", at: index * 1000 } })),
      9000,
    )
    const withoutTime = applyRestoredEvents(
      INITIAL_SESSION_STATE,
      events.map((event) => ({ event, time: { kind: "unknown" } })),
      9000,
    )

    expect(timesOf(withTime)).toEqual([
      { kind: "recovered", at: 1000 },
      { kind: "recovered", at: 2000 },
    ])
    expect(timesOf(withoutTime)).toEqual([{ kind: "restored" }, { kind: "restored" }])
  })
})
