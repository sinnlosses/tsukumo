import { describe, expect, it } from "vitest"

import {
  beadsOutcomeOf,
  memoizeByStamp,
  type BeadsOutcome,
} from "../../../../src/server/repository/adapter/beads.ts"

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

function issueOf(extra: Record<string, unknown>): unknown {
  return {
    id: "gh-1",
    title: "架空の題",
    status: "open",
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  }
}

function attributesOf(extra: Record<string, unknown>) {
  const outcome = beadsOutcomeOf(JSON.stringify([issueOf(extra)]))
  if (outcome.kind !== "issues") {
    throw new Error("読めるはず")
  }
  const [issue] = outcome.issues
  if (issue === undefined) {
    throw new Error("課題が残るはず")
  }
  return { difficulty: issue.difficulty, loopable: issue.loopable, labels: issue.labels }
}

function draftOf(extra: Record<string, unknown>): boolean | undefined {
  const outcome = beadsOutcomeOf(JSON.stringify([issueOf(extra)]))
  return outcome.kind === "issues" ? outcome.issues[0]?.draft : undefined
}

describe("beadsOutcomeOf の metadata", () => {
  it("draft が Y なら draft、無いか Y 以外なら draft でない", () => {
    expect(draftOf({ metadata: { draft: "Y" } })).toBe(true)
    expect(draftOf({ metadata: {} })).toBe(false)
    expect(draftOf({ metadata: { draft: "N" } })).toBe(false)
  })

  it("difficulty と loopable を読む", () => {
    expect(attributesOf({ metadata: { difficulty: "sonnet", loopable: "Y" } })).toMatchObject({
      difficulty: "sonnet",
      loopable: "Y",
    })
  })

  it("ほかのキーは無視する", () => {
    expect(
      attributesOf({ metadata: { difficulty: "opus", loopable: "N", task_plan_base: "x" } }),
    ).toMatchObject({ difficulty: "opus", loopable: "N" })
  })

  it("表に無い値は undefined にし、課題は残す", () => {
    expect(attributesOf({ metadata: { difficulty: "gpt", loopable: "y" } })).toMatchObject({
      difficulty: undefined,
      loopable: undefined,
    })
  })

  it("文字列でない値は undefined", () => {
    expect(attributesOf({ metadata: { difficulty: 3 } }).difficulty).toBeUndefined()
  })

  it.each([
    ["null", { metadata: null }],
    ["欄なし", {}],
    ["配列", { metadata: ["sonnet"] }],
  ])("metadata が%sでも課題は残り、属性は undefined", (_name, extra) => {
    expect(attributesOf(extra)).toMatchObject({ difficulty: undefined, loopable: undefined })
  })

  it("label からは読まず、labels は字のまま", () => {
    expect(attributesOf({ labels: ["difficulty:opus"] })).toEqual({
      difficulty: undefined,
      loopable: undefined,
      labels: ["difficulty:opus"],
    })
  })
})
