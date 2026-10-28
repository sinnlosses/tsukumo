import { describe, expect, it } from "vitest"

import { phaseDurations } from "../../../src/shared/session/phase-duration.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import type { RecordTime } from "../../../src/shared/session/session-record.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import {
  advanceWorkPlanTrail,
  EMPTY_WORK_PLAN_TRAIL,
  type WorkPlanTrail,
} from "../../../src/shared/session/work-plan-trail.ts"
import type { DelegatedRange, WorkPlanEntry } from "../../../src/shared/session/work-plan.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"

const PHASES = ["架空の計画", "架空の実装", "架空の検証"]

type Timed = readonly [SessionEvent, number]

function plan(
  current: number,
  phases: readonly WorkPlanEntry[] = PHASES,
  delegatedRange: DelegatedRange = { kind: "none" },
): SessionEvent {
  return {
    kind: "work-plan",
    delegatedRange,
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phases,
    current,
    finishedInGroup: [],
    phaseSummary: current === 0 ? "" : "架空のまとめ。",
  }
}

const stopped = reportEvent({ toolUseId: "toolu_stopped", workPlanClosing: "stopped" })

/** 秒の時刻つきのイベントを本番の畳みで記録にし、記録を前からなぞった並び。 */
function trailOf(events: readonly Timed[]): WorkPlanTrail {
  const state = events.reduce(
    (current, [event, seconds]) => applySessionEvent(current, event, seconds * 1000),
    INITIAL_SESSION_STATE,
  )
  return state.records.reduce<WorkPlanTrail>(
    (trail, record) => advanceWorkPlanTrail(trail, record),
    EMPTY_WORK_PLAN_TRAIL,
  )
}

function at(seconds: number): RecordTime {
  return { kind: "stamped", at: seconds * 1000 }
}

/** 区間ごとの、記録の時刻（秒）と閉じる時刻。 */
function shapeOf(trail: WorkPlanTrail) {
  return {
    carried: trail.carried.map((stretch) => ({
      times: stretch.plans.map((record) => record.time),
      closedAt: stretch.closedAt,
    })),
    times: trail.plans.map((record) => record.time),
  }
}

describe("advanceWorkPlanTrail", () => {
  it("前の依頼にワークプランが無ければ、何も引き継がない", () => {
    const trail = trailOf([
      [requestEvent(), 0],
      [reportEvent(), 5],
      [requestEvent("続けて（架空の依頼）"), 100],
      [plan(1), 101],
    ])

    expect(shapeOf(trail)).toEqual({ carried: [], times: [at(101)] })
  })

  it("段の並びが同じなら前の依頼の記録を引き継ぎ、区間は最後の report の時刻で閉じる", () => {
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0), 1],
      [plan(1), 10],
      [stopped, 25],
      [requestEvent("続けて（架空の依頼）"), 100],
      [plan(1), 101],
      [plan(2), 110],
    ])

    expect(shapeOf(trail)).toEqual({
      carried: [{ times: [at(1), at(10)], closedAt: at(25) }],
      times: [at(101), at(110)],
    })
  })

  it("前の依頼が finished の report で全部の段を終えていれば、同じ段の並びでやり直しても引き継がない", () => {
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0), 1],
      [plan(1), 10],
      [plan(2), 20],
      [reportEvent({ toolUseId: "toolu_finished", workPlanClosing: "finished" }), 25],
      [requestEvent("もう一度やり直して（架空の依頼）"), 100],
      [plan(0), 101],
    ])

    expect(shapeOf(trail)).toEqual({ carried: [], times: [at(101)] })
  })

  it("止めて再開した依頼を finished で終えたあとのやり直しは、それより前の区間も引き継がない", () => {
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0), 1],
      [stopped, 5],
      [requestEvent("続けて（架空の依頼）"), 50],
      [plan(0), 51],
      [plan(2), 55],
      [reportEvent({ toolUseId: "toolu_finished", workPlanClosing: "finished" }), 60],
      [requestEvent("もう一度やり直して（架空の依頼）"), 200],
      [plan(0), 201],
    ])

    expect(shapeOf(trail)).toEqual({ carried: [], times: [at(201)] })
  })

  it("段の並びが変わった再開は、前の依頼の記録を引き継がない", () => {
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0), 1],
      [plan(1), 10],
      [stopped, 25],
      [requestEvent("続けて（架空の依頼）"), 100],
      [plan(1, ["架空の計画", "架空の実装", "架空の文書", "架空の検証"]), 101],
    ])

    expect(shapeOf(trail)).toEqual({ carried: [], times: [at(101)] })
  })

  it("並列の段の中の段が変わった再開も、段の並びが変わったとして引き継がない", () => {
    const grouped = ["架空の計画", ["架空のサーバ", "架空の画面"], "架空の検証"]
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0, grouped), 1],
      [stopped, 25],
      [requestEvent("続けて（架空の依頼）"), 100],
      [plan(1, ["架空の計画", ["架空のサーバ"], "架空の検証"]), 101],
    ])

    expect(shapeOf(trail).carried).toEqual([])
  })

  it("前の依頼に report が無ければ、区間は次の依頼の時刻で閉じる", () => {
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0), 1],
      [requestEvent("続けて（架空の依頼）"), 40],
      [plan(0), 41],
    ])

    expect(shapeOf(trail).carried).toEqual([{ times: [at(1)], closedAt: at(40) }])
  })

  it("report のあとに積まれたワークプランの記録があれば、区間はその記録の時刻で閉じる", () => {
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0), 1],
      [reportEvent(), 10],
      [plan(1), 12],
      [requestEvent("続けて（架空の依頼）"), 40],
      [plan(1), 41],
    ])

    expect(shapeOf(trail).carried).toEqual([{ times: [at(1), at(12)], closedAt: at(12) }])
  })

  it("2回止めて2回再開したら、2つの区間を古い順に引き継ぐ", () => {
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0), 1],
      [stopped, 5],
      [requestEvent("続けて（架空の依頼）"), 50],
      [plan(0), 51],
      [plan(1), 55],
      [stopped, 60],
      [requestEvent("続けて（架空の依頼）"), 200],
      [plan(1), 201],
    ])

    expect(shapeOf(trail)).toEqual({
      carried: [
        { times: [at(1)], closedAt: at(5) },
        { times: [at(51), at(55)], closedAt: at(60) },
      ],
      times: [at(201)],
    })
  })

  it("範囲を初めて宣言した記録は、範囲の先頭の段が今の段として残り、その段の所要が測れる", () => {
    const phases = ["架空の計画", "架空の段1", "架空の段2", "架空の受け入れ"]
    const declared = plan(0, phases, { kind: "range", first: 1, count: 2 })
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0, phases), 1],
      [declared, 10],
      [plan(2, phases), 40],
    ])

    expect(trail.plans.map((record) => record.current)).toEqual([0, 1, 2])
    expect(
      phaseDurations(trail, at(60), "none")
        .map((row) => (row.kind === "phase" ? row.duration : row.wall))
        .slice(0, 2),
    ).toEqual([
      { kind: "known", milliseconds: 9_000 },
      { kind: "known", milliseconds: 30_000 },
    ])
  })

  it("再開した依頼でワークプランがまだ渡っていなければ、引き継ぎを決めずに待つ", () => {
    const trail = trailOf([
      [requestEvent(), 0],
      [plan(0), 1],
      [stopped, 5],
      [requestEvent("続けて（架空の依頼）"), 50],
    ])

    expect(shapeOf(trail)).toEqual({ carried: [], times: [] })
    expect(trail.awaiting).toHaveLength(1)
  })
})
