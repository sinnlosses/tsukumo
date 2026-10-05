import { describe, expect, it } from "vitest"

import { phaseDurations } from "../../../src/shared/session/phase-duration.ts"
import type { RecordTime, SessionRecord } from "../../../src/shared/session/session-state.ts"

type WorkPlanRecord = Extract<SessionRecord, { readonly kind: "work-plan" }>

const PHASES = ["架空の調べ", "架空の実装", "架空の検証"]

function plan(current: number, time: RecordTime, phases = PHASES): WorkPlanRecord {
  return { kind: "work-plan", phases, current, phaseSummary: "", time }
}

function at(seconds: number): RecordTime {
  return { kind: "stamped", at: seconds * 1000 }
}

const RESTORED = { kind: "restored" } as const satisfies RecordTime

function known(seconds: number) {
  return { kind: "known", milliseconds: seconds * 1000 } as const
}

const UNKNOWN = { kind: "unknown" } as const

describe("phaseDurations", () => {
  it("順に進んだ段は、今の段になった時刻から次の段になった時刻まで", () => {
    expect(
      phaseDurations([plan(0, at(0)), plan(1, at(10)), plan(2, at(25)), plan(3, at(30))], at(99)),
    ).toEqual([
      { label: "1/3 架空の調べ", duration: known(10) },
      { label: "2/3 架空の実装", duration: known(15) },
      { label: "3/3 架空の検証", duration: known(5) },
    ])
  })

  it("全部済みの呼び出しが無ければ、最後の段は report の時刻で閉じる", () => {
    expect(phaseDurations([plan(0, at(0)), plan(1, at(10)), plan(2, at(25))], at(40))).toEqual([
      { label: "1/3 架空の調べ", duration: known(10) },
      { label: "2/3 架空の実装", duration: known(15) },
      { label: "3/3 架空の検証", duration: known(15) },
    ])
  })

  it("一足飛びで越えた段は不明で、飛ぶ前の段は飛んだ時刻までを持つ", () => {
    expect(phaseDurations([plan(0, at(0)), plan(2, at(10)), plan(3, at(12))], at(99))).toEqual([
      { label: "1/3 架空の調べ", duration: known(10) },
      { label: "2/3 架空の実装", duration: UNKNOWN },
      { label: "3/3 架空の検証", duration: known(2) },
    ])
  })

  it("復元した記録の段は、時刻が分からないので不明", () => {
    expect(
      phaseDurations([plan(0, RESTORED), plan(1, RESTORED), plan(2, RESTORED)], RESTORED),
    ).toEqual([
      { label: "1/3 架空の調べ", duration: UNKNOWN },
      { label: "2/3 架空の実装", duration: UNKNOWN },
      { label: "3/3 架空の検証", duration: UNKNOWN },
    ])
  })

  it("依頼の最初の記録が途中の段なら、その段と前の段は不明", () => {
    expect(phaseDurations([plan(1, at(0)), plan(2, at(10))], at(15))).toEqual([
      { label: "1/3 架空の調べ", duration: UNKNOWN },
      { label: "2/3 架空の実装", duration: UNKNOWN },
      { label: "3/3 架空の検証", duration: known(5) },
    ])
  })

  it("同じ段に戻ったら、測れた区間を足す", () => {
    expect(
      phaseDurations([plan(0, at(0)), plan(1, at(10)), plan(0, at(12)), plan(1, at(15))], at(20)),
    ).toEqual([
      { label: "1/3 架空の調べ", duration: known(13) },
      { label: "2/3 架空の実装", duration: known(7) },
      { label: "3/3 架空の検証", duration: UNKNOWN },
    ])
  })

  it("組み替えたら最後の並びで描き、並びに残った段は組み替える前の時間を引き継ぐ", () => {
    const reorganized = ["架空の調べ", "架空の設計", "架空の実装"]

    expect(
      phaseDurations([plan(0, at(0)), plan(1, at(10)), plan(2, at(20), reorganized)], at(30)),
    ).toEqual([
      { label: "1/3 架空の調べ", duration: known(10) },
      { label: "2/3 架空の設計", duration: UNKNOWN },
      { label: "3/3 架空の実装", duration: known(20) },
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
      { label: "1/4 計画", duration: known(5) },
      { label: "2/4 実装", duration: known(15) },
      { label: "3/4 実装", duration: known(10) },
      { label: "4/4 受け入れ", duration: known(1) },
    ])
  })

  it("段取りが無ければ空", () => {
    expect(phaseDurations([], at(0))).toEqual([])
  })
})
