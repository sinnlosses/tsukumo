import { describe, expect, it } from "bun:test"

import { throttle } from "../../src/usecase/throttle.ts"

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("throttle", () => {
  it("間隔の中で連続して呼んでも、最初の1回はすぐに配らない（間隔の終わりにまとめて配る）", async () => {
    const received: number[] = []
    const publish = throttle<number>((value) => received.push(value), 20)

    publish(1)
    expect(received).toEqual([])

    await wait(30)
    expect(received).toEqual([1])
  })

  it("間隔の間に複数回呼んでも、間隔の終わりには最新の値だけを1回配る", async () => {
    const received: number[] = []
    const publish = throttle<number>((value) => received.push(value), 20)

    publish(1)
    publish(2)
    publish(3)

    await wait(30)
    expect(received).toEqual([3])
  })

  it("間隔をまたいで呼ぶと、そのたびに新しい間隔が始まりまた配られる", async () => {
    const received: number[] = []
    const publish = throttle<number>((value) => received.push(value), 20)

    publish(1)
    await wait(30)
    publish(2)
    await wait(30)

    expect(received).toEqual([1, 2])
  })

  it("間隔の間に1回も呼ばれなければ、間隔が終わっても何も配らない", async () => {
    const received: number[] = []
    throttle<number>((value) => received.push(value), 20)

    await wait(30)
    expect(received).toEqual([])
  })
})
