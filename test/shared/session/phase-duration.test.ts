import { describe, expect, it } from "vitest"

import {
  finishedPhaseDuration,
  phaseDurations as phaseDurationsClosing,
} from "../../../src/shared/session/phase-duration.ts"
import type { RecordTime, SessionRecord } from "../../../src/shared/session/session-record.ts"
import {
  EMPTY_WORK_PLAN_TRAIL,
  type WorkPlanStretch,
  type WorkPlanTrail,
} from "../../../src/shared/session/work-plan-trail.ts"
import type { WorkPlanClosing, WorkPlanEntry } from "../../../src/shared/session/work-plan.ts"
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
  skippedPhases: readonly string[] = [],
): WorkPlanRecord {
  return {
    kind: "work-plan",
    phases,
    current,
    finishedInGroup,
    phaseSummary: "",
    delegatedRange: { kind: "none" },
    skippedPhases,
    awaitingSummary: { kind: "none" },
    time,
  }
}

function within(plans: readonly WorkPlanRecord[]): WorkPlanTrail {
  return { ...EMPTY_WORK_PLAN_TRAIL, plans }
}

function resumed(
  carried: readonly WorkPlanStretch[],
  plans: readonly WorkPlanRecord[],
): WorkPlanTrail {
  return { ...EMPTY_WORK_PLAN_TRAIL, carried, plans }
}

function at(seconds: number): RecordTime {
  return { kind: "stamped", at: seconds * 1000 }
}

const RESTORED = { kind: "restored" } as const satisfies RecordTime

function known(seconds: number) {
  return { kind: "known", milliseconds: seconds * 1000 } as const
}

const UNKNOWN = { kind: "unknown" } as const

function row(
  label: string,
  duration: MeasuredTime,
  start: MeasuredTime = UNKNOWN,
  absence: "none" | "not-started" | "skipped" = "none",
) {
  return { kind: "phase", label, start, duration, absence } as const
}

function phaseDurations(
  trail: WorkPlanTrail,
  closedAt: RecordTime,
  closing: WorkPlanClosing = "none",
) {
  return phaseDurationsClosing(trail, closedAt, closing)
}

describe("phaseDurations", () => {
  it("順に進んだ段は、今の段になった時刻から次の段になった時刻まで", () => {
    expect(
      phaseDurations(
        within([plan(0, at(0)), plan(1, at(10)), plan(2, at(25)), plan(3, at(30))]),
        at(99),
      ),
    ).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", known(15), known(10)),
      row("3/3 架空の検証", known(5), known(25)),
    ])
  })

  it("全部済みの呼び出しが無ければ、最後の段は report の時刻で閉じる", () => {
    expect(
      phaseDurations(within([plan(0, at(0)), plan(1, at(10)), plan(2, at(25))]), at(40)),
    ).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", known(15), known(10)),
      row("3/3 架空の検証", known(15), known(25)),
    ])
  })

  it("一足飛びで越えた段は不明で、飛ぶ前の段は飛んだ時刻までを持つ", () => {
    expect(
      phaseDurations(within([plan(0, at(0)), plan(2, at(10)), plan(3, at(12))]), at(99)),
    ).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", known(2), known(10)),
    ])
  })

  it("復元した記録の段は、時刻が分からないので不明", () => {
    expect(
      phaseDurations(within([plan(0, RESTORED), plan(1, RESTORED), plan(2, RESTORED)]), RESTORED),
    ).toEqual([
      row("1/3 架空の調べ", UNKNOWN),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", UNKNOWN),
    ])
  })

  it("依頼の最初の記録が途中の段なら、その段と前の段は不明", () => {
    expect(phaseDurations(within([plan(1, at(0)), plan(2, at(10))]), at(15))).toEqual([
      row("1/3 架空の調べ", UNKNOWN),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", known(5), known(10)),
    ])
  })

  it("同じ段に戻ったら、測れた区間を足す", () => {
    expect(
      phaseDurations(
        within([plan(0, at(0)), plan(1, at(10)), plan(0, at(12)), plan(1, at(15))]),
        at(20),
      ),
    ).toEqual([
      row("1/3 架空の調べ", known(13), known(0)),
      row("2/3 架空の実装", known(7), known(10)),
      row("3/3 架空の検証", UNKNOWN),
    ])
  })

  it("組み替えたら最後の並びで描き、並びに残った段は組み替える前の時間を引き継ぐ", () => {
    const reorganized = ["架空の調べ", "架空の設計", "架空の実装"]

    expect(
      phaseDurations(
        within([plan(0, at(0)), plan(1, at(10)), plan(2, at(20), reorganized)]),
        at(30),
      ),
    ).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の設計", UNKNOWN),
      row("3/3 架空の実装", known(20), known(10)),
    ])
  })

  it("同じ名前の段が並んでも、何番目かで分けて測る", () => {
    const delegated = ["計画", "実装", "実装", "受け入れ"]

    expect(
      phaseDurations(
        within([
          plan(0, at(0), delegated),
          plan(1, at(5), delegated),
          plan(1, at(8), delegated),
          plan(2, at(20), delegated),
          plan(3, at(30), delegated),
        ]),
        at(31),
      ),
    ).toEqual([
      row("1/4 計画", known(5), known(0)),
      row("2/4 実装", known(15), known(5)),
      row("3/4 実装", known(10), known(20)),
      row("4/4 受け入れ", known(1), known(30)),
    ])
  })

  it("ワークプランが無ければ空", () => {
    expect(phaseDurations(within([]), at(0))).toEqual([])
  })
})

describe("phaseDurations（止めて再開した依頼の引き継ぎ）", () => {
  it("引き継いだ区間の段も測れ、止めた段は前後の区間の和で、あいだの待ちは所要にも開始にも入らない", () => {
    const stopped = { plans: [plan(0, at(0)), plan(1, at(10))], closedAt: at(25) }

    expect(
      phaseDurations(
        resumed([stopped], [plan(1, at(100)), plan(2, at(108)), plan(3, at(112))]),
        at(120),
      ),
    ).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", known(23), known(10)),
      row("3/3 架空の検証", known(4), known(33)),
    ])
  })

  it("引き継いだあとの区間の頭は途中の位置でも測れ、並び全体の頭が途中の位置ならその段は不明のまま", () => {
    const midway = { plans: [plan(1, at(0))], closedAt: at(10) }

    expect(phaseDurations(resumed([midway], [plan(1, at(50)), plan(2, at(55))]), at(60))).toEqual([
      row("1/3 架空の調べ", UNKNOWN),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", known(5), known(15)),
    ])
  })

  it("引き継いだ区間の端が復元した記録なら、その段と、それより後の開始は不明", () => {
    const restored = { plans: [plan(0, RESTORED), plan(1, RESTORED)], closedAt: RESTORED }

    expect(
      phaseDurations(resumed([restored], [plan(1, at(100)), plan(2, at(104))]), at(110)),
    ).toEqual([
      row("1/3 架空の調べ", UNKNOWN),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", known(6)),
    ])
  })
})

describe("phaseDurations（並列の段）", () => {
  const overlapped = [
    plan(0, at(0), GROUPED),
    plan(1, at(10), GROUPED),
    plan(1, at(16), GROUPED, ["架空の画面"]),
    plan(2, at(20), GROUPED),
    plan(3, at(25), GROUPED),
  ]

  it("重なって走った段はそれぞれの所要が出て、並列の段の所要は中の段の和ではなく壁時計", () => {
    expect(phaseDurations(within(overlapped), at(99))).toEqual([
      row("1/4 架空の調べ", known(10), known(0)),
      {
        kind: "parallel",
        label: "並列 2–3",
        start: known(10),
        wall: known(10),
        absence: "none",
        phases: [
          { label: "2/4 架空のサーバ", start: known(10), duration: known(10), absence: "none" },
          { label: "3/4 架空の画面", start: known(10), duration: known(6), absence: "none" },
        ],
      },
      row("4/4 架空の検証", known(5), known(20)),
    ])
  })

  it("中間レポートの所要は、並列の段の中の段もその段の区間で探す", () => {
    expect(finishedPhaseDuration(within(overlapped), "3/4 架空の画面", at(99))).toEqual(known(6))
  })

  it("依頼の最初の記録が並列の段の途中なら、並列の段と中の段は不明", () => {
    expect(
      phaseDurations(
        within([plan(1, at(0), GROUPED, ["架空の画面"]), plan(2, at(4), GROUPED)]),
        at(9),
      ),
    ).toEqual([
      row("1/4 架空の調べ", UNKNOWN),
      {
        kind: "parallel",
        label: "並列 2–3",
        start: UNKNOWN,
        wall: UNKNOWN,
        absence: "none",
        phases: [
          { label: "2/4 架空のサーバ", start: UNKNOWN, duration: UNKNOWN, absence: "none" },
          { label: "3/4 架空の画面", start: UNKNOWN, duration: UNKNOWN, absence: "none" },
        ],
      },
      row("4/4 架空の検証", known(5), known(4)),
    ])
  })
})

describe("phaseDurations（未着手と飛ばした）", () => {
  it("停止で終え、後の段を一度も今にしなかったら未着手で、時間のある段はそのまま", () => {
    expect(phaseDurations(within([plan(0, at(0)), plan(1, at(10))]), at(25), "stopped")).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", known(15), known(10)),
      row("3/3 架空の検証", UNKNOWN, UNKNOWN, "not-started"),
    ])
  })

  it("停止以外で終えたなら、済んでいない段も未着手にせず不明のまま", () => {
    for (const closing of ["finished", "none"] as const) {
      expect(phaseDurations(within([plan(0, at(0)), plan(1, at(10))]), at(25), closing)).toEqual([
        row("1/3 架空の調べ", known(10), known(0)),
        row("2/3 架空の実装", known(15), known(10)),
        row("3/3 架空の検証", UNKNOWN),
      ])
    }
  })

  it("skippedPhases の段は区間が測れていても飛ばしたになり、前後の段は時間を持つ", () => {
    expect(
      phaseDurations(
        within([
          plan(0, at(0)),
          plan(1, at(10)),
          plan(2, at(12), PHASES, [], ["架空の実装"]),
          plan(3, at(20), PHASES, [], ["架空の実装"]),
        ]),
        at(30),
        "finished",
      ),
    ).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", UNKNOWN, known(10), "skipped"),
      row("3/3 架空の検証", known(8), known(12)),
    ])
  })

  it("skippedPhases の段が一度も今にならなくても飛ばした", () => {
    expect(
      phaseDurations(
        within([
          plan(0, at(0)),
          plan(2, at(10), PHASES, [], ["架空の実装"]),
          plan(3, at(12), PHASES, [], ["架空の実装"]),
        ]),
        at(20),
        "finished",
      ),
    ).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", UNKNOWN, UNKNOWN, "skipped"),
      row("3/3 架空の検証", known(2), known(10)),
    ])
  })

  it("一足飛びで越えただけで飛ばしていない済みの段は、停止でも不明", () => {
    expect(phaseDurations(within([plan(0, at(0)), plan(2, at(10))]), at(20), "stopped")).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", known(10), known(10)),
    ])
  })

  it("止めて再開したあとにまた止めたら、引き継いだ区間で今だった段は時間を持ち、どの区間でも今にならなかった段だけが未着手", () => {
    const stopped = { plans: [plan(0, at(0)), plan(1, at(10))], closedAt: at(25) }

    expect(
      phaseDurations(resumed([stopped], [plan(1, at(100)), plan(2, at(108))]), at(112), "stopped"),
    ).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", known(23), known(10)),
      row("3/3 架空の検証", known(4), known(33)),
    ])
    expect(phaseDurations(resumed([stopped], [plan(1, at(100))]), at(112), "stopped")).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", known(27), known(10)),
      row("3/3 架空の検証", UNKNOWN, UNKNOWN, "not-started"),
    ])
  })

  it("再開をまたいで finished で終えた依頼は、引き継いだ区間があっても未着手を出さない", () => {
    const stopped = { plans: [plan(0, at(0)), plan(1, at(10))], closedAt: at(25) }

    expect(
      phaseDurations(resumed([stopped], [plan(1, at(100)), plan(3, at(108))]), at(112), "finished"),
    ).toEqual([
      row("1/3 架空の調べ", known(10), known(0)),
      row("2/3 架空の実装", known(23), known(10)),
      row("3/3 架空の検証", UNKNOWN),
    ])
  })

  it("復元した記録の区間で今だった段は、停止でも未着手ではなく不明", () => {
    expect(
      phaseDurations(within([plan(0, RESTORED), plan(1, RESTORED)]), RESTORED, "stopped"),
    ).toEqual([
      row("1/3 架空の調べ", UNKNOWN),
      row("2/3 架空の実装", UNKNOWN),
      row("3/3 架空の検証", UNKNOWN, UNKNOWN, "not-started"),
    ])
  })

  it("並列の段の中が全部未着手なら並列の行も未着手で、一部だけなら時間も不明のまま", () => {
    const stopped = phaseDurations(within([plan(0, at(0), GROUPED)]), at(10), "stopped")

    expect(stopped.at(1)).toEqual({
      kind: "parallel",
      label: "並列 2–3",
      start: UNKNOWN,
      wall: UNKNOWN,
      absence: "not-started",
      phases: [
        { label: "2/4 架空のサーバ", start: UNKNOWN, duration: UNKNOWN, absence: "not-started" },
        { label: "3/4 架空の画面", start: UNKNOWN, duration: UNKNOWN, absence: "not-started" },
      ],
    })
    expect(stopped.at(2)).toEqual(row("4/4 架空の検証", UNKNOWN, UNKNOWN, "not-started"))
  })

  it("中間レポートの所要は、飛ばした段も区間の長さを返す", () => {
    expect(
      finishedPhaseDuration(
        within([plan(0, at(0)), plan(1, at(10)), plan(2, at(12), PHASES, [], ["架空の実装"])]),
        "2/3 架空の実装",
        at(20),
      ),
    ).toEqual(known(2))
  })
})
