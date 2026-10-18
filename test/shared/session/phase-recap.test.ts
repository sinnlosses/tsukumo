import { describe, expect, it } from "vitest"

import { phaseRecapsOf } from "../../../src/shared/session/phase-recap.ts"
import type { RecordTime, SessionRecord } from "../../../src/shared/session/session-record.ts"
import { plannedPhasesOf, type WorkPlanEntry } from "../../../src/shared/session/work-plan.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>

const PHASES = ["架空の調べ", "架空の実装", "架空の検証"]

const GROUPED: readonly WorkPlanEntry[] = [
  "架空の調べ",
  ["架空のサーバ", "架空の画面"],
  "架空の検証",
]

function plan(
  current: number,
  time: RecordTime,
  phaseSummary = "",
  phases: readonly WorkPlanEntry[] = PHASES,
  finishedInGroup: readonly string[] = [],
): WorkPlanRecord {
  return {
    kind: "work-plan",
    phases,
    current,
    finishedInGroup,
    phaseSummary,
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    time,
  }
}

function at(seconds: number): RecordTime {
  return { kind: "stamped", at: seconds * 1000 }
}

function known(seconds: number) {
  return { kind: "known", milliseconds: seconds * 1000 } as const
}

const UNKNOWN = { kind: "unknown" } as const

/** 段の名前（同じ名前の段が無い並び）から `key` を引く。 */
function keyOf(record: WorkPlanRecord, name: string): string {
  const found = plannedPhasesOf(record).find((phase) => phase.name === name)
  if (found === undefined) {
    throw new Error(`段が無い: ${name}`)
  }
  return found.key
}

describe("phaseRecapsOf", () => {
  it("済んだ段は所要とまとめ、今の段は closedAt までの経過、まだの段は所要が不明でまとめが空", () => {
    const last = plan(2, at(25), "架空の実装のまとめ")
    const recaps = phaseRecapsOf(
      [plan(0, at(0)), plan(1, at(10), "架空の調べのまとめ"), last],
      at(40),
    )

    expect(recaps.get(keyOf(last, "架空の調べ"))).toEqual({
      duration: known(10),
      summary: "架空の調べのまとめ",
    })
    expect(recaps.get(keyOf(last, "架空の実装"))).toEqual({
      duration: known(15),
      summary: "架空の実装のまとめ",
    })
    expect(recaps.get(keyOf(last, "架空の検証"))).toEqual({ duration: known(15), summary: "" })
  })

  it("一度も今の段にならなかった段は所要が不明でまとめが空", () => {
    const last = plan(1, at(10), "架空の調べのまとめ")
    const recaps = phaseRecapsOf([plan(0, at(0)), last], at(30))

    expect(recaps.get(keyOf(last, "架空の検証"))).toEqual({ duration: UNKNOWN, summary: "" })
  })

  it("依頼の最初の記録が途中から始まったら、そのとき今だった段の所要は不明", () => {
    const last = plan(2, at(10), "架空の実装のまとめ")
    const recaps = phaseRecapsOf([plan(1, at(0)), last], at(30))

    expect(recaps.get(keyOf(last, "架空の実装"))).toEqual({
      duration: UNKNOWN,
      summary: "架空の実装のまとめ",
    })
    expect(recaps.get(keyOf(last, "架空の調べ"))).toEqual({ duration: UNKNOWN, summary: "" })
  })

  it("まとめを渡さずに進んだ段は、まとめが空", () => {
    const last = plan(1, at(10))
    const recaps = phaseRecapsOf([plan(0, at(0)), last], at(30))

    expect(recaps.get(keyOf(last, "架空の調べ"))).toEqual({ duration: known(10), summary: "" })
  })

  it("並列の段の中の段が別々に済めば、段ごとに別のまとめを持つ", () => {
    const last = plan(2, at(30), "架空のサーバのまとめ", GROUPED)
    const recaps = phaseRecapsOf(
      [
        plan(0, at(0), "", GROUPED),
        plan(1, at(10), "架空の調べのまとめ", GROUPED),
        plan(1, at(20), "架空の画面のまとめ", GROUPED, ["架空の画面"]),
        last,
      ],
      at(40),
    )

    expect(recaps.get(keyOf(last, "架空の画面"))).toEqual({
      duration: known(10),
      summary: "架空の画面のまとめ",
    })
    expect(recaps.get(keyOf(last, "架空のサーバ"))).toEqual({
      duration: known(20),
      summary: "架空のサーバのまとめ",
    })
  })

  it("委譲の返却で積まれた記録のまとめも、済んだ段のまとめとして拾う", () => {
    const ranged = (current: number, time: RecordTime, phaseSummary = ""): WorkPlanRecord => ({
      ...plan(current, time, phaseSummary),
      delegatedRange: { kind: "range", first: 0, count: 3 },
    })
    const last = ranged(1, at(10), "返却の要約の1文。")
    const recaps = phaseRecapsOf([ranged(0, at(0)), last], at(30))

    expect(recaps.get(keyOf(last, "架空の調べ"))?.summary).toBe("返却の要約の1文。")
  })

  it("まとめの空の返却で済んだ段は、同じ位置の次の記録のまとめを段のまとめにする", () => {
    const returned: WorkPlanRecord = {
      ...plan(1, at(10)),
      awaitingSummary: { kind: "awaiting", key: "架空の調べ\u00000" },
    }
    const last = plan(1, at(12), "架空の調べのまとめ")
    const recaps = phaseRecapsOf([plan(0, at(0)), returned, last], at(30))

    expect(recaps.get(keyOf(last, "架空の調べ"))).toEqual({
      duration: known(10),
      summary: "架空の調べのまとめ",
    })
  })

  it("ワークプランが無ければ空", () => {
    expect(phaseRecapsOf([], at(0)).size).toBe(0)
  })
})
