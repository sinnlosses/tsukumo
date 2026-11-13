import { describe, expect, it } from "vitest"

import type { DelegateReturn } from "../../../src/shared/session/delegate-return.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { nextWorkPlan } from "../../../src/shared/session/work-plan-fold.ts"
import { lapEntriesOf, nextPhaseLaps } from "../../../src/shared/session/work-plan-lap.ts"
import {
  advanceWorkPlanTrail,
  EMPTY_WORK_PLAN_TRAIL,
  type WorkPlanTrail,
} from "../../../src/shared/session/work-plan-trail.ts"
import { plannedPhasesOf } from "../../../src/shared/session/work-plan.ts"
import { requestEvent } from "../../fixture/session-event.ts"
import { next, PHASES, planned } from "../../fixture/work-plan-draft.ts"

describe("nextPhaseLaps", () => {
  it("前のワークプランが無ければ全部 1", () => {
    expect(nextPhaseLaps({ kind: "none" }, next(PHASES, 0))).toEqual([1, 1, 1])
  })

  it("戻していなければ周は進まない（先へ進めても同じ）", () => {
    expect(nextPhaseLaps(planned(PHASES, 0), next(PHASES, 1))).toEqual([1, 1, 1])
    expect(nextPhaseLaps(planned(PHASES, 1), next(PHASES, 1))).toEqual([1, 1, 1])
  })

  it("済んだ段へ戻すと、戻した先の段の周だけが 1 進む", () => {
    expect(nextPhaseLaps(planned(PHASES, 2), next(PHASES, 1))).toEqual([1, 2, 1])
  })

  it("周は名前で引き継ぐ。並びが変わっても、戻した周は残る", () => {
    const first = nextWorkPlan(planned(PHASES, 2), {
      kind: "work-plan",
      ...next(PHASES, 1),
    })
    const reordered = ["架空の新しい段", ...PHASES]
    const after = nextWorkPlan(first, { kind: "work-plan", ...next(reordered, 2) })

    expect(after.kind === "planned" ? after.phaseLaps : undefined).toEqual([1, 1, 2, 1])
  })
})

describe("nextWorkPlan の phase-redone", () => {
  const ranged = (current: number) => ({
    ...planned(PHASES, current),
    delegatedRange: { kind: "range", first: 0, count: 3 } as const,
  })

  it("位置を動かさず、その段の周だけを進め、PlannedPhase.lap に出る", () => {
    const plan = nextWorkPlan(ranged(1), {
      kind: "delegate-returned",
      handback: { kind: "phase-redone", phase: 2, count: 3, summary: "架空の差し戻し" },
    })

    expect(plan.kind === "planned" ? plan.current : undefined).toBe(1)
    expect(plan.kind === "planned" ? plannedPhasesOf(plan).map((phase) => phase.lap) : []).toEqual([
      1, 2, 1,
    ])
  })

  it("範囲の外の redo は何も変えない", () => {
    const before = ranged(1)
    const after = nextWorkPlan(before, {
      kind: "delegate-returned",
      handback: { kind: "phase-redone", phase: 1, count: 9, summary: "架空の差し戻し" },
    })

    expect(after).toBe(before)
  })
})

describe("lapEntriesOf", () => {
  const RANGE = { kind: "range", first: 0, count: 3 } as const
  const plan = (current: number): SessionEvent => ({
    kind: "work-plan",
    ...next(PHASES, current),
    delegatedRange: RANGE,
  })
  const returned = (handback: DelegateReturn): SessionEvent => ({
    kind: "delegate-returned",
    handback,
  })
  const redo = (summary: string) => returned({ kind: "phase-redone", phase: 2, count: 3, summary })
  const done = returned({ kind: "phase-done", phase: 2, count: 3, summary: "架空のまとめ" })

  /** 秒の時刻つきのイベントを本番の畳みで記録にし、記録を前からなぞった並び。 */
  function trailOf(events: readonly (readonly [SessionEvent, number])[]): WorkPlanTrail {
    const state = events.reduce(
      (current, [event, seconds]) => applySessionEvent(current, event, seconds * 1000),
      INITIAL_SESSION_STATE,
    )
    return state.records.reduce<WorkPlanTrail>(advanceWorkPlanTrail, EMPTY_WORK_PLAN_TRAIL)
  }

  const keyOf = (index: number): string => plannedPhasesOf(next(PHASES, 0))[index]?.key ?? ""

  it("差し戻し1回で、その段に周の境目が1つ並び、始まりは段に入った時刻", () => {
    const entries = lapEntriesOf(
      trailOf([
        [requestEvent(), 0],
        [plan(1), 10],
        [redo("架空の差し戻し1"), 40],
      ]),
    )

    expect(entries.get(keyOf(1))).toEqual([
      {
        lap: 1,
        startedAt: { kind: "stamped", at: 10_000 },
        rejectedAt: { kind: "stamped", at: 40_000 },
        reason: "架空の差し戻し1",
      },
    ])
  })

  it("差し戻し2回で2つ並び、2周目は1周目の差し戻しから始まる。済んでも残る", () => {
    const entries = lapEntriesOf(
      trailOf([
        [requestEvent(), 0],
        [plan(1), 10],
        [redo("架空の差し戻し1"), 40],
        [redo("架空の差し戻し2"), 70],
        [done, 90],
      ]),
    )

    expect(entries.get(keyOf(1))).toEqual([
      expect.objectContaining({ lap: 1, reason: "架空の差し戻し1" }),
      {
        lap: 2,
        startedAt: { kind: "stamped", at: 40_000 },
        rejectedAt: { kind: "stamped", at: 70_000 },
        reason: "架空の差し戻し2",
      },
    ])
  })

  it("周が増えていない段は並ばない", () => {
    const entries = lapEntriesOf(
      trailOf([
        [requestEvent(), 0],
        [plan(1), 10],
        [redo("架空の差し戻し1"), 40],
      ]),
    )

    expect(entries.get(keyOf(0)) ?? []).toEqual([])
    expect(entries.get(keyOf(2)) ?? []).toEqual([])
  })

  it("phase-redone の要約は、差し戻しの理由として記録に残る", () => {
    const state = [requestEvent(), plan(1), redo("架空の差し戻し1")].reduce(
      (current, event) => applySessionEvent(current, event, 0),
      INITIAL_SESSION_STATE,
    )

    expect(state.records.at(-1)).toMatchObject({ kind: "work-plan", redoReason: "架空の差し戻し1" })
  })
})
