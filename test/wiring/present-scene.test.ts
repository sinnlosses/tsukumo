import { describe, expect, it } from "vitest"

import type { DoneTodayRead } from "../../src/server/session-driver/core/present-scene.ts"
import { wirePresentScene } from "../../src/wiring/present-scene.ts"

// 値はすべて架空。待ちは手で解く約束で置き換える。

function wireWith(doneToday: () => Promise<DoneTodayRead>) {
  const waits: (() => void)[] = []
  const wired = wirePresentScene({
    doneToday,
    nextTask: () => ({ kind: "none" }),
    wait: () =>
      new Promise<void>((resolve) => {
        waits.push(resolve)
      }),
  })
  return { wired, expire: () => waits.forEach((resolve) => resolve()) }
}

describe("wirePresentScene", () => {
  it("今日終えた数の読みが待ちより遅ければ unknown", async () => {
    const { wired, expire } = wireWith(() => new Promise<DoneTodayRead>(() => {}))
    const read = wired.sourceOf(Promise.resolve([])).doneToday()

    expire()

    expect(await read).toEqual({ kind: "unknown" })
  })

  it("待ちより先に読めれば、読めた数", async () => {
    const { wired } = wireWith(() => Promise.resolve({ kind: "known", count: 3 }))

    expect(await wired.sourceOf(Promise.resolve([])).doneToday()).toEqual({
      kind: "known",
      count: 3,
    })
  })

  it("turn-finished で今日終えた数を1回読んでおく", () => {
    const reads: string[] = []
    const { wired } = wireWith(() => {
      reads.push("read")
      return Promise.resolve({ kind: "unknown" })
    })

    wired.observe({ kind: "turn-started" })
    wired.observe({ kind: "turn-finished", outcome: { kind: "completed" } })

    expect(reads).toEqual(["read"])
  })
})
