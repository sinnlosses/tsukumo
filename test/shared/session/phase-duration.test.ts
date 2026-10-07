import { describe, expect, it } from "vitest"

import {
  finishedPhaseDuration,
  phaseDurations,
} from "../../../src/shared/session/phase-duration.ts"
import type { RecordTime, SessionRecord } from "../../../src/shared/session/session-state.ts"
import type { WorkPlanEntry } from "../../../src/shared/session/work-plan.ts"
import type { MeasuredTime } from "../../../src/shared/utils/elapsed-time.ts"

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
  phases: readonly WorkPlanEntry[] = PHASES,
  finishedInGroup: readonly string[] = [],
): WorkPlanRecord {
  return { kind: "work-plan", phases, current, finishedInGroup, phaseSummary: "", time }
}

function at(seconds: number): RecordTime {
  return { kind: "stamped", at: seconds * 1000 }
}

const RESTORED = { kind: "restored" } as const satisfies RecordTime

function known(seconds: number) {
  return { kind: "known", milliseconds: seconds * 1000 } as const
}

const UNKNOWN = { kind: "unknown" } as const

function row(label: string, duration: MeasuredTime) {
  return { kind: "phase", label, duration } as const
}

describe("phaseDurations", () => {
  it("順に進んだ段は、今の段になった時刻から次の段になった時刻まで", () => {
    expect(
      phaseDurations([plan(0, at(0)), plan(1, at(10)), plan(2, at(25)), plan(3, at(30))], at(99)),
    ).toEqual([
      row("1/3 架空の調べ", known(10)),
      row("2/3 架空の実装", known(15)),
      row("3/3 架空の検証", known(5)),
    ])
  })

  it("全部済みの呼び出しが無ければ、最後の段は report の時刻で閉じる", () => {
    expect(phaseDurations([plan(0, at(0)), plan(1, at(10)), plan(2, at(25))], at(40))).toEqual([
      row("1/3 架空の調べ", known(10)),
      row("2/3 架空の実装", known(15)),
      row("3/3 架空の検証", known(15)),
    ])
  })

  it("一足飛びで越えた段は不明で、飛ぶ前の段は飛んだ時刻までを持つ", () => {
    expect(phaseDurations([plan(0, at(0)), plan(2, at(10)), plan(3, at(12))], at(99))).toEqual([
      row("1/3 架空の調べ", known(10)),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", known(2)),
    ])
  })

  it("復元した記録の段は、時刻が分からないので不明", () => {
    expect(
      phaseDurations([plan(0, RESTORED), plan(1, RESTORED), plan(2, RESTORED)], RESTORED),
    ).toEqual([
      row("1/3 架空の調べ", UNKNOWN),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", UNKNOWN),
    ])
  })

  it("依頼の最初の記録が途中の段なら、その段と前の段は不明", () => {
    expect(phaseDurations([plan(1, at(0)), plan(2, at(10))], at(15))).toEqual([
      row("1/3 架空の調べ", UNKNOWN),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", known(5)),
    ])
  })

  it("同じ段に戻ったら、測れた区間を足す", () => {
    expect(
      phaseDurations([plan(0, at(0)), plan(1, at(10)), plan(0, at(12)), plan(1, at(15))], at(20)),
    ).toEqual([
      row("1/3 架空の調べ", known(13)),
      row("2/3 架空の実装", known(7)),
      row("3/3 架空の検証", UNKNOWN),
    ])
  })

  it("組み替えたら最後の並びで描き、並びに残った段は組み替える前の時間を引き継ぐ", () => {
    const reorganized = ["架空の調べ", "架空の設計", "架空の実装"]

    expect(
      phaseDurations([plan(0, at(0)), plan(1, at(10)), plan(2, at(20), reorganized)], at(30)),
    ).toEqual([
      row("1/3 架空の調べ", known(10)),
      row("2/3 架空の設計", UNKNOWN),
      row("3/3 架空の実装", known(20)),
    ])
  })

  it("同じ名前の段が並んでも、何番目かで分けて測る", () => {
    const delegated = ["計画", "実装", "実装", "受け入れ"]

    expect(
      phaseDurations(
        [
          plan(0, at(0), delegated),
          plan(1, at(5), delegated),
          plan(1, at(8), delegated),
          plan(2, at(20), delegated),
          plan(3, at(30), delegated),
        ],
        at(31),
      ),
    ).toEqual([
      row("1/4 計画", known(5)),
      row("2/4 実装", known(15)),
      row("3/4 実装", known(10)),
      row("4/4 受け入れ", known(1)),
    ])
  })

  it("段取りが無ければ空", () => {
    expect(phaseDurations([], at(0))).toEqual([])
  })
})

describe("phaseDurations（段のまとまり）", () => {
  const overlapped = [
    plan(0, at(0), GROUPED),
    plan(1, at(10), GROUPED),
    plan(1, at(16), GROUPED, ["架空の画面"]),
    plan(2, at(20), GROUPED),
    plan(3, at(25), GROUPED),
  ]

  it("重なって走った段はそれぞれの所要が出て、まとまりの所要は中の段の和ではなく壁時計", () => {
    expect(phaseDurations(overlapped, at(99))).toEqual([
      row("1/4 架空の調べ", known(10)),
      {
        kind: "parallel",
        label: "並列 2·3",
        wall: known(10),
        phases: [
          { label: "2/4 架空のサーバ", duration: known(10) },
          { label: "3/4 架空の画面", duration: known(6) },
        ],
      },
      row("4/4 架空の検証", known(5)),
    ])
  })

  it("中間レポートの所要は、まとまりの中の段もその段の区間で探す", () => {
    expect(finishedPhaseDuration(overlapped, "3/4 架空の画面", at(99))).toEqual(known(6))
  })

  it("依頼の最初の記録がまとまりの途中なら、まとまりと中の段は不明", () => {
    expect(
      phaseDurations([plan(1, at(0), GROUPED, ["架空の画面"]), plan(2, at(4), GROUPED)], at(9)),
    ).toEqual([
      row("1/4 架空の調べ", UNKNOWN),
      {
        kind: "parallel",
        label: "並列 2·3",
        wall: UNKNOWN,
        phases: [
          { label: "2/4 架空のサーバ", duration: UNKNOWN },
          { label: "3/4 架空の画面", duration: UNKNOWN },
        ],
      },
      row("4/4 架空の検証", known(5)),
    ])
  })
})
