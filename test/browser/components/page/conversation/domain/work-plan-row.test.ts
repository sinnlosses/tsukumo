import { describe, expect, it } from "vitest"

import type { PhaseRecap } from "../../../../../../src/browser/components/page/conversation/domain/phase-recap.ts"
import {
  foldDelegates,
  foldLaps,
  foldWorkPlanSlots,
  rowsOfSlot,
  type WorkPlanRow,
  type WorkPlanSlot,
  workPlanSlotsOf,
} from "../../../../../../src/browser/components/page/conversation/domain/work-plan-row.ts"
import type { DelegateRole } from "../../../../../../src/shared/session/delegate-role.ts"
import type { TurnStep } from "../../../../../../src/shared/session/turn-step.ts"
import {
  currentPhaseOf,
  plannedPhasesOf,
  type PlannedWorkPlan,
  type WorkPlanEntry,
} from "../../../../../../src/shared/session/work-plan.ts"
import { checkedTaskId } from "../../../../../fixture/task-id.ts"

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
  byName: Readonly<Record<string, Omit<PhaseRecap, "laps"> & Partial<Pick<PhaseRecap, "laps">>>>,
): ReadonlyMap<string, PhaseRecap> {
  return new Map(
    plannedPhasesOf(plan).flatMap((phase) => {
      const recap = byName[phase.name]
      return recap === undefined ? [] : [[phase.key, { laps: [], ...recap }] as const]
    }),
  )
}

function at(seconds: number) {
  return { kind: "stamped", at: seconds * 1000 } as const
}

/** 秒で書いた周の境目（始まり・差し戻し）と理由。 */
function lap(number: number, startedAt: number, rejectedAt: number, reason: string) {
  return { lap: number, startedAt: at(startedAt), rejectedAt: at(rejectedAt), reason }
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
        delegates: [],
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
        delegates: [],
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
    const slots = workPlanSlotsOf({ plan, recaps: new Map(), steps: [], delegates: [] })

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

describe("workPlanSlotsOf の周", () => {
  const rowAt = (
    current: number,
    laps: readonly ReturnType<typeof lap>[],
    seconds: number,
  ): WorkPlanRow | undefined => {
    const plan = planned(current)
    return rowsOf(
      workPlanSlotsOf({
        plan,
        recaps: recapsOf(plan, { 架空の実装: { duration: known(seconds), summary: "", laps } }),
        steps: [],
        delegates: [],
      }),
    )[1]
  }

  it("差し戻し1回の今の段は、1周目の差し戻しと、いまの直しの2行。直しの所要は段の所要から1周目を引いたもの", () => {
    expect(rowAt(1, [lap(1, 10, 40, "架空の差し戻し1")], 50)?.laps).toEqual([
      {
        key: "1-rejected",
        label: "1周目",
        result: "rejected",
        text: "架空の差し戻し1",
        duration: known(30),
      },
      { key: "1-fixed", label: "直し", result: "now", text: "", duration: known(20) },
    ])
  })

  it("差し戻し2回で済んだ段は4行で、最後の直しは済んだ印", () => {
    const laps = rowAt(
      2,
      [lap(1, 10, 40, "架空の差し戻し1"), lap(2, 40, 70, "架空の差し戻し2")],
      80,
    )?.laps

    expect(laps?.map((row) => [row.label, row.result, row.text])).toEqual([
      ["1周目", "rejected", "架空の差し戻し1"],
      ["直し", "fixed", ""],
      ["2周目", "rejected", "架空の差し戻し2"],
      ["直し", "fixed", ""],
    ])
    expect(laps?.[2]?.duration).toEqual(known(30))
    expect(laps?.[3]?.duration).toEqual(known(20))
  })

  it("周が増えていない段は周の行を持たない", () => {
    expect(rowAt(1, [], 50)?.laps).toEqual([])
  })
})

describe("foldLaps", () => {
  const lapsOf = (rejections: number) => {
    const plan = planned(1)
    const laps = Array.from({ length: rejections }, (_, index) =>
      lap(index + 1, index * 10, index * 10 + 10, `架空の差し戻し${String(index + 1)}`),
    )
    return (
      rowsOf(
        workPlanSlotsOf({
          plan,
          recaps: recapsOf(plan, { 架空の実装: { duration: known(100), summary: "", laps } }),
          steps: [],
          delegates: [],
        }),
      )[1]?.laps ?? []
    )
  }

  it("4周目に入ると、いまの周と1つ前の周だけを残し、それより前の周を畳む", () => {
    const { folded, laps } = foldLaps(lapsOf(3))

    expect(folded).toMatchObject({ kind: "folded", count: 1 })
    expect(folded.kind === "folded" ? folded.laps.map((row) => row.label) : []).toEqual([
      "1周目",
      "直し",
    ])
    expect(laps.map((row) => row.label)).toEqual(["2周目", "直し", "3周目", "直し"])
  })

  it("3周目までは畳まない", () => {
    const rows = lapsOf(2)

    expect(foldLaps(rows)).toEqual({ folded: { kind: "none" }, laps: rows })
  })
})

describe("任せた役の行", () => {
  const role = (id: string, state: DelegateRole["state"]): DelegateRole => ({
    taskId: checkedTaskId(id),
    name: `架空の役${id}`,
    state,
    summary: `架空の進み${id}`,
    at: 1000,
  })
  const delegatesOf = (roles: readonly DelegateRole[]) => {
    const plan = planned(1)
    return (
      rowsOf(workPlanSlotsOf({ plan, recaps: new Map(), steps: [], delegates: roles }))[1]
        ?.delegates ?? []
    )
  }

  it("任せた役が2つなら、今の段に2行。名前と進みの1行を持つ", () => {
    const delegates = delegatesOf([role("1", "running"), role("2", "done")])

    expect(delegates.map((row) => [row.name, row.state, row.text])).toEqual([
      ["架空の役1", "running", "架空の進み1"],
      ["架空の役2", "done", "架空の進み2"],
    ])
    expect(foldDelegates(delegates).folded).toEqual({ kind: "none" })
  })

  it("役が6つ以上なら、済んだ役だけを畳み、動いている役を残す", () => {
    const { folded, delegates } = foldDelegates(
      delegatesOf([
        role("1", "done"),
        role("2", "running"),
        role("3", "done"),
        role("4", "running"),
        role("5", "running"),
        role("6", "running"),
      ]),
    )

    expect(folded.kind === "folded" ? folded.delegates.map((row) => row.name) : []).toEqual([
      "架空の役1",
      "架空の役3",
    ])
    expect(delegates.map((row) => row.name)).toEqual([
      "架空の役2",
      "架空の役4",
      "架空の役5",
      "架空の役6",
    ])
  })

  it("動いている役は6つ以上でも畳まない", () => {
    const roles = ["1", "2", "3", "4", "5", "6", "7"].map((id) => role(id, "running"))
    const { folded, delegates } = foldDelegates(delegatesOf(roles))

    expect(folded).toEqual({ kind: "none" })
    expect(delegates).toHaveLength(7)
  })

  it("今でない段は任せた役を持たない", () => {
    const plan = planned(1)
    const rows = rowsOf(
      workPlanSlotsOf({
        plan,
        recaps: new Map(),
        steps: [],
        delegates: [role("1", "running")],
      }),
    )

    expect(rows.map((row) => row.delegates.length)).toEqual([0, 1, 0, 0])
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
      delegates: [],
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
      foldWorkPlanSlots(
        workPlanSlotsOf({ plan: short, recaps: new Map(), steps: [], delegates: [] }),
      ).folded,
    ).toEqual({ kind: "none" })
    const early = planned(1, {}, LONG)
    expect(
      foldWorkPlanSlots(
        workPlanSlotsOf({ plan: early, recaps: new Map(), steps: [], delegates: [] }),
      ).folded,
    ).toEqual({ kind: "none" })
  })
})
