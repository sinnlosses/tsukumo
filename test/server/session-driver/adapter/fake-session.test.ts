import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readFakeSession } from "../../../../src/server/session-driver/adapter/fake-session.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { currentWorkPlan } from "../../../../src/shared/session/work-plan-fold.ts"
import { type DelegatedRange, parseWorkPlan } from "../../../../src/shared/session/work-plan.ts"
import { bundledFakeSession } from "../../../fixture/bundled-fake-session.ts"

describe("readFakeSession", () => {
  describe("読めないとき", () => {
    let directory: string

    beforeEach(() => {
      directory = mkdtempSync(path.join(tmpdir(), "tsukumo-fake-session-"))
    })

    afterEach(() => {
      rmSync(directory, { recursive: true, force: true })
    })

    function readWritten(content: string): ReturnType<typeof readFakeSession> {
      const file = path.join(directory, "session.json")
      writeFileSync(file, content)
      return readFakeSession(file)
    }

    function step(afterMs: number): unknown {
      return { afterMs, event: { kind: "utterance", text: "架空の本文" } }
    }

    function sessionJson(opening: readonly unknown[], steps: readonly unknown[]): string {
      return JSON.stringify({ opening, turns: [{ name: "架空の場面", steps }] })
    }

    it("無いファイルは unreadable", () => {
      expect(readFakeSession(path.join(directory, "none.json")).kind).toBe("unreadable")
    })

    it("JSON でないものと形の違う JSON は unreadable", () => {
      expect(readWritten("{").kind).toBe("unreadable")
      expect(readWritten("{}").kind).toBe("unreadable")
    })

    it("場面の中で afterMs が手の並びの順に減ると、場面名と手の位置つきで拒む", () => {
      const reading = readWritten(sessionJson([], [step(0), step(300), step(100)]))

      expect(reading.kind).toBe("unreadable")
      expect(reading.kind === "unreadable" ? reading.reason : "").toMatch(/場面 架空の場面 の手 2/)
    })

    it("opening の中で afterMs が減ると、opening と手の位置つきで拒む", () => {
      const reading = readWritten(sessionJson([step(200), step(100)], []))

      expect(reading.kind).toBe("unreadable")
      expect(reading.kind === "unreadable" ? reading.reason : "").toMatch(/opening の手 1/)
    })

    it("waitForAnswer の手は時刻の数え直しなので、前の手より afterMs が小さくても読める", () => {
      const waiting = {
        afterMs: 100,
        waitForAnswer: true,
        event: { kind: "utterance", text: "架空の本文" },
      }

      expect(readWritten(sessionJson([], [step(0), step(300), waiting, step(200)])).kind).toBe(
        "read",
      )
    })

    it("afterMs が同じ値で続く場面と、手が0本・1本の場面は読める", () => {
      expect(readWritten(sessionJson([], [step(0), step(0), step(200), step(200)])).kind).toBe(
        "read",
      )
      expect(readWritten(sessionJson([step(5)], [])).kind).toBe("read")
    })
  })
})

describe("同梱の疑似セッションの委譲の返却", () => {
  it("場面 delegated-handback は、phase_result の結果だけで帯を最後の1段の手前まで進める", () => {
    const scene = bundledFakeSession().turns.find((turn) => turn.name === "delegated-handback")
    if (scene === undefined) {
      throw new Error("場面 delegated-handback が無い")
    }

    const state = scene.steps.reduce(
      (view, { event }) => applySessionEvent(view, event, 0),
      INITIAL_SESSION_STATE,
    )
    const plans = state.records.filter((record) => record.kind === "work-plan")

    expect(plans.map((record) => record.current)).toEqual([1, 2, 3])
    expect(currentWorkPlan(state.records)).toMatchObject({ current: 3 })
  })
})

describe("同梱の疑似セッションのワークプラン", () => {
  it("全ての work-plan の件が、ワークプランの全欄を持ち workPlanSchema を通る", () => {
    const session = bundledFakeSession()
    const plans = [...session.opening, ...session.turns.flatMap((scene) => scene.steps)].flatMap(
      ({ event }) => (event.kind === "work-plan" ? [event] : []),
    )

    expect(plans.length).toBeGreaterThan(0)
    for (const plan of plans) {
      const { phases, current, finishedInGroup, phaseSummary, delegatedRange, skippedPhases } = plan
      const parsed = parseWorkPlan({
        phases,
        current,
        finishedInGroup,
        phaseSummary,
        delegatedRange: toToolRange(delegatedRange),
        skippedPhases,
      })

      expect(parsed).toEqual({
        phases,
        current,
        finishedInGroup,
        phaseSummary,
        delegatedRange,
        skippedPhases,
        awaitingSummary: plan.awaitingSummary,
      })
    }
  })
})

function toToolRange(range: DelegatedRange) {
  switch (range.kind) {
    case "none":
      return undefined
    case "pending":
      return { first: range.first }
    case "range":
      return { first: range.first, count: range.count }
    default:
      throw new Error("delegatedRange が none・pending・range のどれでもない")
  }
}
