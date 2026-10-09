import { describe, expect, it } from "vitest"

import { turnElapsedClock, turnElapsedText } from "../../../src/browser/domain/turn-elapsed.ts"

describe("turnElapsedClock", () => {
  it("進行中は「分:秒」、1時間を超えたら「時:分:秒」", () => {
    const turn = { kind: "running", startedAt: 0 } as const

    expect(turnElapsedClock(turn, 0, 1_203_000)).toBe("20:03")
    expect(turnElapsedClock(turn, 0, 3_723_000)).toBe("1:02:03")
  })

  it("終わったターンは終わった時刻で止まり、背景のタスクが残る間は数え続ける（広い画面の字と同じ秒）", () => {
    const turn = {
      kind: "finished",
      startedAt: 0,
      finishedAt: 65_000,
      ending: { kind: "ended" },
    } as const

    expect(turnElapsedClock(turn, 0, 999_000)).toBe("1:05")
    expect(turnElapsedText(turn, 0, 999_000)).toBe("1分05秒")
    expect(turnElapsedClock(turn, 1, 125_000)).toBe("2:05")
  })

  it("依頼が一度も無ければ「-」", () => {
    expect(turnElapsedClock({ kind: "idle" }, 0, 0)).toBe("-")
  })
})
