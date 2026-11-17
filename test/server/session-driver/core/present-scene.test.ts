import { describe, expect, it } from "vitest"

import {
  nextTaskOf,
  presentSceneOf,
  type PresentSceneInput,
  restoredRequestTimes,
} from "../../../../src/server/session-driver/core/present-scene.ts"
import type { TaskSummaryItem } from "../../../../src/shared/repository/task-summary.ts"
import type { RestoredEvent } from "../../../../src/shared/session/session-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"
import { taskStatusOfWord } from "../../../fixture/session-state.ts"

// 値はすべて架空。

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const NOW = 1_000 * HOUR

const BASE: PresentSceneInput = { now: NOW, hour: 12, requestTimes: [NOW] }

describe("presentSceneOf: 時刻の帯", () => {
  it.each([
    [4, "late-night"],
    [5, "morning"],
    [10, "daytime"],
    [16, "evening"],
    [19, "night"],
  ] as const)("%d 時は %s", (hour, band) => {
    expect(presentSceneOf({ ...BASE, hour }).timeBand).toBe(band)
  })
})

describe("presentSceneOf: 続けて働いた時間", () => {
  it("2 時間ちょうどから渡し、手前は無い", () => {
    expect(presentSceneOf({ ...BASE, requestTimes: [NOW - 2 * HOUR] }).workedHours).toBe(2)
    expect(presentSceneOf({ ...BASE, requestTimes: [NOW - 2 * HOUR + 1] }).workedHours).toBe(
      undefined,
    )
  })

  it("1 時間で切り捨てる", () => {
    expect(
      presentSceneOf({ ...BASE, requestTimes: [NOW - 3 * HOUR - 59 * MINUTE] }).workedHours,
    ).toBe(3)
  })

  it("隣との間が 30 分未満なら遡り、30 分ちょうどの空きで数え直す", () => {
    const start = NOW - 3 * HOUR
    const steps = [start, start + 29 * MINUTE, start + 58 * MINUTE]
    expect(presentSceneOf({ ...BASE, requestTimes: [...steps, NOW] }).workedHours).toBe(undefined)
    const continued = Array.from({ length: 8 }, (_, index) => start + index * 25 * MINUTE)
    expect(presentSceneOf({ ...BASE, requestTimes: continued }).workedHours).toBe(3)
    const broken = [start, start + 30 * MINUTE]
    expect(presentSceneOf({ ...BASE, requestTimes: broken }).workedHours).toBe(2)
  })

  it("依頼が無ければ無い", () => {
    expect(presentSceneOf({ ...BASE, requestTimes: [] }).workedHours).toBe(undefined)
  })
})

describe("presentSceneOf: 今日終えたタスクの数", () => {
  it("読めた数はそのまま、読めなければ無い", () => {
    expect(presentSceneOf({ ...BASE, doneToday: 3 }).doneToday).toBe(3)
    expect(presentSceneOf(BASE).doneToday).toBe(undefined)
  })
})

describe("presentSceneOf: 前の依頼からの経過", () => {
  it("12 時間ちょうどから渡し、手前は無い", () => {
    expect(presentSceneOf({ ...BASE, requestTimes: [NOW - 12 * HOUR, NOW] }).away).toEqual({
      band: "半日から1日",
      requestAt: NOW,
    })
    expect(presentSceneOf({ ...BASE, requestTimes: [NOW - 12 * HOUR + 1, NOW] }).away).toBe(
      undefined,
    )
  })

  it("依頼が2つ無ければ無い", () => {
    expect(presentSceneOf(BASE).away).toBe(undefined)
  })
})

describe("presentSceneOf: 使用量の帯", () => {
  const usage = (fiveHour: number, sevenDay: number) => ({
    fiveHour: { utilization: fiveHour },
    sevenDay: { utilization: sevenDay },
  })

  it("80 を超えた枠だけ、80 ちょうどは入らない", () => {
    expect(presentSceneOf({ ...BASE, planUsage: usage(80, 80.5) }).overUsage).toEqual(["seven-day"])
    expect(presentSceneOf({ ...BASE, planUsage: usage(81, 81) }).overUsage).toEqual([
      "five-hour",
      "seven-day",
    ])
    expect(presentSceneOf({ ...BASE, planUsage: usage(10, 80) }).overUsage).toEqual([])
  })

  it("使用量を知らなければ無い", () => {
    expect(presentSceneOf(BASE).overUsage).toBe(undefined)
  })
})

describe("presentSceneOf: 次に着手できるタスク", () => {
  it("札の ID の語ならそのまま、ほかの字を含めば無い", () => {
    expect(presentSceneOf({ ...BASE, nextTaskId: "bd-a1.2_x" }).nextTaskId).toBe("bd-a1.2_x")
    expect(presentSceneOf({ ...BASE, nextTaskId: "bd a1" }).nextTaskId).toBe(undefined)
    expect(presentSceneOf(BASE).nextTaskId).toBe(undefined)
  })
})

describe("restoredRequestTimes", () => {
  it("時刻の分かる依頼の時刻だけを昇順に取り出し、依頼でない出来事と時刻の分からない依頼を除く", () => {
    const restored: RestoredEvent[] = [
      { event: requestEvent(), time: { kind: "known", at: 30 }, promptImages: [] },
      { event: { kind: "turn-started" }, time: { kind: "known", at: 40 }, promptImages: [] },
      { event: requestEvent(), time: { kind: "unknown" }, promptImages: [] },
      { event: requestEvent(), time: { kind: "known", at: 10 }, promptImages: [] },
    ]

    expect(restoredRequestTimes(restored)).toEqual([10, 30])
  })
})

describe("nextTaskOf", () => {
  const task = (id: string, status: string): TaskSummaryItem => ({
    id,
    summary: "架空の題",
    status: taskStatusOfWord(status),
    dependencies: [],
    waitingFor: [],
    labels: [],
    difficulty: "sonnet",
    loopable: undefined,
    importance: "normal",
    urgency: "normal",
    body: "",
    location: { kind: "none" },
  })

  it("一覧が読めていれば、おすすめの順の先頭の着手できる札", () => {
    expect(
      nextTaskOf({
        kind: "known",
        items: [task("bd-a1", "doing"), task("bd-a2", "todo"), task("bd-a3", "todo")],
        omittedClosedCount: 0,
      }),
    ).toEqual({ kind: "known", id: "bd-a3" })
  })

  it("着手できるものが無い・一覧が読めていなければ none", () => {
    expect(
      nextTaskOf({ kind: "known", items: [task("bd-a1", "doing")], omittedClosedCount: 0 }),
    ).toEqual({ kind: "none" })
    expect(nextTaskOf({ kind: "loading" })).toEqual({ kind: "none" })
    expect(nextTaskOf({ kind: "unknown" })).toEqual({ kind: "none" })
  })
})
