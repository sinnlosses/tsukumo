import { describe, expect, it } from "vitest"

import { reuseOrReread } from "../../../../src/server/achievement/core/beads-reread.ts"

const within = (elapsedMs: number): boolean => elapsedMs >= 0 && elapsedMs < 1000

describe("reuseOrReread", () => {
  it("前回が無ければ印を渡して読む", () => {
    expect(reuseOrReread(undefined, "a", 0, within)).toEqual({ kind: "reread", readStamp: "a" })
  })

  it("印が同じで間隔内なら使い回す", () => {
    const last = { stamp: "a", at: 0 }
    expect(reuseOrReread(last, "a", 500, within)).toEqual({ kind: "reuse", last })
  })

  it("印が違えば印を渡して読み直す", () => {
    expect(reuseOrReread({ stamp: "a", at: 0 }, "b", 500, within)).toEqual({
      kind: "reread",
      readStamp: "b",
    })
  })

  it("印が同じでも間隔を過ぎたら印を渡さず読み直す", () => {
    expect(reuseOrReread({ stamp: "a", at: 0 }, "a", 1000, within)).toEqual({
      kind: "reread",
      readStamp: undefined,
    })
  })

  it("印が取れないときは使い回さない", () => {
    expect(reuseOrReread({ stamp: "a", at: 0 }, undefined, 500, within)).toEqual({
      kind: "reread",
      readStamp: undefined,
    })
  })
})
