import { describe, expect, it } from "vitest"

import { rememberBySourceCommit } from "../../../../src/server/architecture-map/adapter/map-change-log.ts"

type Log = { readonly kind: "read"; readonly mark: string } | { readonly kind: "uncounted" }

function countingRead(results: readonly Log[]) {
  const state = { calls: 0 }
  const read = () => {
    const result = results[Math.min(state.calls, results.length - 1)] ?? { kind: "uncounted" }
    state.calls += 1
    return Promise.resolve(result)
  }
  return { state, read }
}

describe("rememberBySourceCommit", () => {
  it("同じ source.commit の2回目は read を打たない", async () => {
    const { state, read } = countingRead([{ kind: "read", mark: "a" }])
    const remembered = rememberBySourceCommit(read)

    expect(await remembered("c1")).toEqual({ kind: "read", mark: "a" })
    expect(await remembered("c1")).toEqual({ kind: "read", mark: "a" })
    expect(state.calls).toBe(1)
  })

  it("別の commit では打ち直す", async () => {
    const { state, read } = countingRead([
      { kind: "read", mark: "a" },
      { kind: "read", mark: "b" },
    ])
    const remembered = rememberBySourceCommit(read)

    await remembered("c1")
    expect(await remembered("c2")).toEqual({ kind: "read", mark: "b" })
    expect(state.calls).toBe(2)
  })

  it("uncounted は覚えず、次で打ち直す", async () => {
    const { state, read } = countingRead([{ kind: "uncounted" }, { kind: "read", mark: "a" }])
    const remembered = rememberBySourceCommit(read)

    expect(await remembered("c1")).toEqual({ kind: "uncounted" })
    expect(await remembered("c1")).toEqual({ kind: "read", mark: "a" })
    expect(state.calls).toBe(2)
  })
})
