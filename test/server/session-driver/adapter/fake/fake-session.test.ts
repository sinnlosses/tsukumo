import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readFakeSession } from "../../../../../src/server/session-driver/adapter/fake/fake-session.ts"
import { questionBriefSchema } from "../../../../../src/shared/session-driver/question-brief.ts"
import { applySessionEvent } from "../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../src/shared/session/session-state.ts"
import { currentWorkPlan } from "../../../../../src/shared/session/work-plan-fold.ts"
import { type DelegatedRange, parseWorkPlan } from "../../../../../src/shared/session/work-plan.ts"
import { bundledFakeSession } from "../../../../fixture/bundled-fake-session.ts"

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

    function readScene(
      opening: readonly unknown[],
      steps: readonly unknown[],
    ): ReturnType<typeof readFakeSession> {
      writeFileSync(path.join(directory, "scene.json"), JSON.stringify({ name: "scene", steps }))
      return readWritten(JSON.stringify({ opening, turns: ["scene"] }))
    }

    it("無いファイルは unreadable", () => {
      expect(readFakeSession(path.join(directory, "none.json")).kind).toBe("unreadable")
    })

    it("JSON でないものと形の違う JSON は unreadable", () => {
      expect(readWritten("{").kind).toBe("unreadable")
      expect(readWritten("{}").kind).toBe("unreadable")
    })

    it("索引の場面のファイルが無いと、場面のパスつきで unreadable", () => {
      const reading = readWritten(JSON.stringify({ opening: [], turns: ["missing"] }))

      expect(reading.kind).toBe("unreadable")
      expect(reading.kind === "unreadable" ? reading.reason : "").toContain("missing.json")
    })

    it("場面のファイルの name がファイル名と違うと unreadable", () => {
      writeFileSync(
        path.join(directory, "scene.json"),
        JSON.stringify({ name: "other", steps: [] }),
      )

      expect(readWritten(JSON.stringify({ opening: [], turns: ["scene"] })).kind).toBe("unreadable")
    })

    it("索引の場面名がディレクトリの外を指すと unreadable", () => {
      const inner = path.join(directory, "inner")
      mkdirSync(inner)
      writeFileSync(
        path.join(directory, "outside.json"),
        JSON.stringify({ name: "../outside", steps: [] }),
      )
      const index = path.join(inner, "session.json")
      writeFileSync(index, JSON.stringify({ opening: [], turns: ["../outside"] }))

      expect(readFakeSession(index).kind).toBe("unreadable")
    })

    it("索引と場面のファイルが正しければ、turns は索引の並びで読める", () => {
      for (const name of ["second", "first"]) {
        writeFileSync(path.join(directory, `${name}.json`), JSON.stringify({ name, steps: [] }))
      }
      const reading = readWritten(JSON.stringify({ opening: [], turns: ["second", "first"] }))

      expect(reading.kind === "read" ? reading.session.turns.map((turn) => turn.name) : []).toEqual(
        ["second", "first"],
      )
    })

    it("場面の中で afterMs が手の並びの順に減ると、場面名と手の位置つきで拒む", () => {
      const reading = readScene([], [step(0), step(300), step(100)])

      expect(reading.kind).toBe("unreadable")
      expect(reading.kind === "unreadable" ? reading.reason : "").toMatch(/場面 scene の手 2/)
    })

    it("opening の中で afterMs が減ると、opening と手の位置つきで拒む", () => {
      const reading = readScene([step(200), step(100)], [])

      expect(reading.kind).toBe("unreadable")
      expect(reading.kind === "unreadable" ? reading.reason : "").toMatch(/opening の手 1/)
    })

    it("waitForAnswer の手は時刻の数え直しなので、前の手より afterMs が小さくても読める", () => {
      const waiting = {
        afterMs: 100,
        waitForAnswer: true,
        event: { kind: "utterance", text: "架空の本文" },
      }

      expect(readScene([], [step(0), step(300), waiting, step(200)]).kind).toBe("read")
    })

    it("afterMs が同じ値で続く場面と、手が0本・1本の場面は読める", () => {
      expect(readScene([], [step(0), step(0), step(200), step(200)]).kind).toBe("read")
      expect(readScene([step(5)], []).kind).toBe("read")
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
        phaseIds: plan.phaseIds,
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

describe("同梱の疑似セッションの質問の添え書き", () => {
  it("全ての添え書きが、questionBriefSchema で読んだ結果と同じ全欄を持つ", () => {
    const session = bundledFakeSession()
    const scenes = [{ name: "opening", steps: session.opening }, ...session.turns]
    const briefs = scenes.flatMap((scene) =>
      scene.steps.flatMap(({ event }, stepIndex) => {
        const found =
          event.kind === "pending-changed"
            ? event.pending.flatMap((ask) => (ask.kind === "question" ? ask.briefs : []))
            : event.kind === "question-answered"
              ? event.briefs
              : []
        return found.map((brief) => ({ where: `${scene.name} 手${String(stepIndex)}`, brief }))
      }),
    )

    expect(briefs.length).toBeGreaterThan(0)
    const problems = briefs.flatMap(({ where, brief }) => {
      const parsed = questionBriefSchema.safeParse(brief)
      if (!parsed.success) {
        return [
          `${where}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(" / ")}`,
        ]
      }
      return brief.options.flatMap((option, optionIndex) =>
        isDeepStrictEqual(parsed.data.options[optionIndex], option)
          ? []
          : [`${where}: 選択肢 ${option.label} が、読むと既定値で補われる欄を欠く`],
      )
    })

    expect(problems).toEqual([])
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
