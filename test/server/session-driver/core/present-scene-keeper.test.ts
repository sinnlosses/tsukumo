import { describe, expect, it } from "vitest"

import {
  createPresentSceneKeeper,
  type PresentSceneSource,
} from "../../../../src/server/session-driver/core/present-scene-keeper.ts"
import type { PresentSceneKind } from "../../../../src/shared/diagnostic/present-scene.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

// 値はすべて架空。

const HOUR = 3_600_000

/** 昼で、ほかの材料を読めない口。 */
const SOURCE: PresentSceneSource = {
  localHourAt: () => 12,
  earlierRequestTimes: () => Promise.resolve([]),
  doneToday: () => Promise.resolve({ kind: "unknown" }),
  nextTask: () => ({ kind: "none" }),
}

function keeperWith(source: PresentSceneSource = SOURCE) {
  let clock = 1_000 * HOUR
  const notified: (readonly PresentSceneKind[])[] = []
  const keeper = createPresentSceneKeeper(
    source,
    () => clock,
    (kinds) => {
      notified.push(kinds)
    },
  )
  return {
    keeper,
    notified,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

describe("createPresentSceneKeeper", () => {
  it("同じ材料を2回続けて渡さない", async () => {
    const { keeper } = keeperWith()

    expect(await keeper.take()).toContain("- 時間帯: 昼")
    expect(await keeper.take()).toBe("")
  })

  it("観た依頼の時刻が、続けて働いた時間と前の依頼からの経過に効く", async () => {
    const { keeper, advance } = keeperWith()
    keeper.observe(requestEvent())
    await keeper.take()

    advance(13 * HOUR)
    keeper.observe(requestEvent())
    expect(await keeper.take()).toContain("- 前の依頼からの経過: 半日から1日")

    Array.from({ length: 5 }).forEach(() => {
      advance(25 * 60_000)
      keeper.observe(requestEvent())
    })
    expect(await keeper.take()).toBe(
      "いまの様子（tsukumo が添える。言うかどうかは任せる）\n- 続けて働いた時間: 2時間を超えた",
    )
  })

  it("conversation-cleared のあとは渡し直すが、依頼の時刻は残る", async () => {
    const { keeper, advance } = keeperWith()
    keeper.observe(requestEvent())
    advance(2 * HOUR)
    await keeper.take()

    keeper.observe({ kind: "conversation-cleared" })
    const again = await keeper.take()

    expect(again).toContain("- 時間帯: 昼")
    expect(again).toContain("- 続けて働いた時間: 2時間を超えた")
  })

  it("ready でない使用量は覚えない", async () => {
    const { keeper } = keeperWith()
    await keeper.take()
    keeper.notePlanUsage({ kind: "unavailable" })
    expect(await keeper.take()).toBe("")

    keeper.notePlanUsage({
      kind: "ready",
      usage: { fiveHour: { utilization: 85 }, sevenDay: {} },
    })
    expect(await keeper.take()).toContain("- 使用量の集計期間: 5時間の枠が8割を超えた")
  })

  it("組み直した依頼の時刻が、観た依頼の前に並ぶ", async () => {
    const start = 1_000 * HOUR - 3 * HOUR
    const { keeper } = keeperWith({
      ...SOURCE,
      earlierRequestTimes: () =>
        Promise.resolve(Array.from({ length: 8 }, (_, index) => start + index * 25 * 60_000)),
    })
    keeper.observe(requestEvent())

    expect(await keeper.take()).toContain("- 続けて働いた時間: 3時間を超えた")
  })

  it("渡したときだけ種類の語を知らせ、文面は知らせない", async () => {
    const { keeper, notified } = keeperWith({
      ...SOURCE,
      doneToday: () => Promise.resolve({ kind: "known", count: 2 }),
      nextTask: () => ({ kind: "known", id: "bd-a1" }),
    })

    await keeper.take()
    await keeper.take()

    expect(notified).toEqual([["time-band", "done-today", "next-task"]])
  })
})
