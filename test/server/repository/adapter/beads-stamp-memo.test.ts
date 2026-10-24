import { describe, expect, it } from "vitest"

import { memoizeByStamp } from "../../../../src/server/repository/adapter/beads-stamp-memo.ts"
import type { BeadsOutcome } from "../../../../src/server/repository/adapter/beads.ts"

describe("memoizeByStamp", () => {
  function countedReader(outcomes: readonly BeadsOutcome[] = []) {
    const state = { calls: 0 }
    const read = memoizeByStamp(() => {
      const outcome = outcomes[state.calls] ?? { kind: "issues", issues: [] }
      state.calls += 1
      return Promise.resolve(outcome)
    })
    return { read, state }
  }

  it("同じ印で続けて読んでも、読みは1回で、同時の読みにも同じ結果を渡す", async () => {
    const { read, state } = countedReader()

    const results = await Promise.all([read("/repo", "a"), read("/repo", "a")])
    await read("/repo", "a")

    expect(state.calls).toBe(1)
    expect(results[0]).toBe(results[1])
  })

  it("印が変わると読み直す", async () => {
    const { read, state } = countedReader()

    await read("/repo", "a")
    await read("/repo", "b")

    expect(state.calls).toBe(2)
  })

  it("印が取れないときは毎回読む", async () => {
    const { read, state } = countedReader()

    await read("/repo", undefined)
    await read("/repo", undefined)

    expect(state.calls).toBe(2)
  })

  it("読めなかった回は、同じ印でも次に読み直す", async () => {
    const { read, state } = countedReader([{ kind: "failed" }])

    await read("/repo", "a")
    await Promise.resolve()
    await read("/repo", "a")

    expect(state.calls).toBe(2)
  })

  it("cwd ごとに覚える", async () => {
    const { read, state } = countedReader()

    await read("/one", "a")
    await read("/two", "a")

    expect(state.calls).toBe(2)
  })
})
