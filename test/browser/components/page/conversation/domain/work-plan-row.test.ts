import { describe, expect, it } from "vitest"

import type { PhaseRecap } from "../../../../../../src/browser/components/page/conversation/domain/phase-recap.ts"
import {
  foldWorkPlanSlots,
  rowsOfSlot,
  type WorkPlanRow,
  type WorkPlanSlot,
  workPlanSlotsOf,
} from "../../../../../../src/browser/components/page/conversation/domain/work-plan-row.ts"
import type { TurnStep } from "../../../../../../src/shared/session/turn-step.ts"
import {
  currentPhaseOf,
  plannedPhasesOf,
  type PlannedWorkPlan,
  type WorkPlanEntry,
} from "../../../../../../src/shared/session/work-plan.ts"

const PHASES = ["架空の調べ", "架空の実装", "架空の検証", "架空の仕上げ"]

function planned(
  current: number,
  overrides: Partial<PlannedWorkPlan> = {},
  phases: readonly WorkPlanEntry[] = PHASES,
): PlannedWorkPlan {
  return {
    kind: "planned",
    phases,
    phaseIds: [],
    current,
    finishedInGroup: [],
    phaseSummary: "",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    ...overrides,
  }
}

function known(seconds: number) {
  return { kind: "known", milliseconds: seconds * 1000 } as const
}

function recapsOf(
  plan: PlannedWorkPlan,
  byName: Readonly<Record<string, PhaseRecap>>,
): ReadonlyMap<string, PhaseRecap> {
  return new Map(
    plannedPhasesOf(plan).flatMap((phase) => {
      const recap = byName[phase.name]
      return recap === undefined ? [] : [[phase.key, recap] as const]
    }),
  )
}

function stepIn(
  plan: PlannedWorkPlan,
  name: string,
  input: unknown,
  id: string,
  status: TurnStep["status"] = { kind: "done", finishedAt: { kind: "stamped", at: 0 } },
): TurnStep {
  return {
    toolUseId: id,
    name,
    input,
    nested: false,
    startedAt: { kind: "stamped", at: 1000 },
    status,
    backgroundEnd: { kind: "foreground" },
    phase: currentPhaseOf(plan),
  }
}

function rowsOf(slots: readonly WorkPlanSlot[]): readonly WorkPlanRow[] {
  return slots.flatMap(rowsOfSlot)
}

describe("workPlanSlotsOf", () => {
  it("済んだ段・飛ばした段・今の段・これからの段に分かれ、済んだ段は所要とまとめを持つ", () => {
    const plan = planned(2, {
      skippedPhases: ["架空の実装"],
      phaseDoings: ["架空の調べ", "架空の実装", "架空の検証をしている", "架空の仕上げ"],
    })
    const rows = rowsOf(
      workPlanSlotsOf({
        plan,
        recaps: recapsOf(plan, {
          架空の調べ: { duration: known(100), summary: "調べのまとめ" },
          架空の実装: { duration: known(5), summary: "飛ばしたわけ" },
          架空の検証: { duration: known(30), summary: "" },
        }),
        steps: [],
      }),
    )

    expect(rows.map((row) => [row.state, row.title, row.ordinal])).toEqual([
      ["done", "架空の調べ", "1"],
      ["skipped", "架空の実装", "2"],
      ["current", "架空の検証をしている", "3"],
      ["upcoming", "架空の仕上げ", "4"],
    ])
    expect(rows[0]).toMatchObject({ duration: known(100), summary: "調べのまとめ" })
    expect(rows[1]).toMatchObject({ summary: "飛ばしたわけ" })
    expect(rows[2]).toMatchObject({ duration: known(30), summary: "" })
    expect(rows[3]).toMatchObject({ duration: { kind: "unknown" }, summary: "" })
  })

  it("段で触ったファイルを段ごとに重ねずに持ち、今の段には最後の手順の実況を開く", () => {
    const earlier = planned(0)
    const plan = planned(1)
    const rows = rowsOf(
      workPlanSlotsOf({
        plan,
        recaps: new Map(),
        steps: [
          stepIn(earlier, "Edit", { file_path: "/架空/a.ts" }, "1"),
          stepIn(plan, "Edit", { file_path: "/架空/b.ts" }, "2"),
          stepIn(plan, "Write", { file_path: "/架空/b.ts" }, "3"),
          stepIn(plan, "Edit", { file_path: "/架空/c.ts" }, "4", {
            kind: "failed",
            output: { head: "", omittedLength: 0 },
            finishedAt: { kind: "stamped", at: 0 },
          }),
          stepIn(plan, "Read", { file_path: "/架空/d.ts" }, "5", { kind: "running" }),
        ],
      }),
    )

    expect(rows[0]?.touched).toEqual(["a.ts"])
    expect(rows[0]?.live).toEqual({ kind: "none" })
    expect(rows[1]?.touched).toEqual(["b.ts"])
    expect(rows[1]?.live).toEqual({
      kind: "now",
      text: "d.tsを読んでいる",
      startedAt: { kind: "stamped", at: 1000 },
    })
  })

  it("並列のフェーズは中の段を1つの要素に並べ、委譲の範囲は群の先頭に群の名を付ける", () => {
    const plan = planned(
      1,
      { delegatedRange: { kind: "range", first: 1, count: 3 }, finishedInGroup: ["架空の画面"] },
      ["架空の計画", ["架空のサーバ", "架空の画面"], "架空の検証", "架空の受け入れ"],
    )
    const slots = workPlanSlotsOf({ plan, recaps: new Map(), steps: [] })

    expect(
      slots.map((slot) => [
        slot.kind,
        slot.spanHead.kind === "head" ? slot.spanHead.name : "",
        rowsOfSlot(slot).map((row) => `${row.ordinal}:${row.state}`),
      ]),
    ).toEqual([
      ["phase", "前", ["前1:done"]],
      ["parallel", "本", ["本1:current", "本2:done"]],
      ["phase", "", ["本3:upcoming"]],
      ["phase", "後", ["後1:upcoming"]],
    ])
    expect(slots[1]).toMatchObject({ label: "並列 本1–2" })
  })
})

describe("foldWorkPlanSlots", () => {
  const LONG = Array.from({ length: 8 }, (_, index) => `架空の段${String(index + 1)}`)

  it("長い並びでは、先頭から済んだ段を1行に畳み、所要の和と触ったファイルの数を持つ", () => {
    const plan = planned(3, {}, LONG)
    const slots = workPlanSlotsOf({
      plan,
      recaps: recapsOf(plan, {
        架空の段1: { duration: known(10), summary: "" },
        架空の段2: { duration: known(20), summary: "" },
        架空の段3: { duration: known(30), summary: "" },
      }),
      steps: [],
    })
    const { folded, slots: rest } = foldWorkPlanSlots(slots)

    expect(folded).toMatchObject({ kind: "folded", count: 3, duration: known(60), touched: 0 })
    expect(rowsOf(rest).map((row) => row.state)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ])
  })

  it("短い並びと、済んだ段が1つしか無い並びは畳まない", () => {
    const short = planned(3)
    expect(
      foldWorkPlanSlots(workPlanSlotsOf({ plan: short, recaps: new Map(), steps: [] })).folded,
    ).toEqual({ kind: "none" })
    const early = planned(1, {}, LONG)
    expect(
      foldWorkPlanSlots(workPlanSlotsOf({ plan: early, recaps: new Map(), steps: [] })).folded,
    ).toEqual({ kind: "none" })
  })
})
