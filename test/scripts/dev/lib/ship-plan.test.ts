// 受け入れ・取り込み・検証・送り出しの順序とやり直しの上限を、偽のフックで検証する。

import { describe, expect, test } from "vitest"

import { runShipPlan, type ShipPlanHooks } from "../../../../scripts/dev/lib/ship-plan.ts"

function fakeHooks(overrides: Partial<ShipPlanHooks> = {}): {
  readonly hooks: ShipPlanHooks
  readonly calls: string[]
} {
  const calls: string[] = []
  const hooks: ShipPlanHooks = {
    hasOpenClaim: () => {
      calls.push("hasOpenClaim")
      return overrides.hasOpenClaim?.() ?? false
    },
    isOwnWorktreeClean: () => {
      calls.push("isOwnWorktreeClean")
      return overrides.isOwnWorktreeClean?.() ?? true
    },
    isMainWorktreeClean: () => {
      calls.push("isMainWorktreeClean")
      return overrides.isMainWorktreeClean?.() ?? true
    },
    review: () => {
      calls.push("review")
      return overrides.review?.() ?? { kind: "passed" }
    },
    rebaseOntoMain: () => {
      calls.push("rebaseOntoMain")
      return overrides.rebaseOntoMain?.() ?? "ok"
    },
    verify: () => {
      calls.push("verify")
      return overrides.verify?.() ?? 0
    },
    mergeFfOnly: () => {
      calls.push("mergeFfOnly")
      return overrides.mergeFfOnly?.() ?? "ok"
    },
    syncSubmodules: () => {
      calls.push("syncSubmodules")
    },
  }
  return { hooks, calls }
}

describe("runShipPlan", () => {
  test("着手中のタスクがあれば clean の確かめ・rebase・verify・merge を呼ばない", () => {
    const { hooks, calls } = fakeHooks({ hasOpenClaim: () => true })
    expect(runShipPlan(hooks)).toEqual({ outcome: "task-claimed" })
    expect(calls).toEqual(["hasOpenClaim"])
  })

  test("正常系は8つのフックを1回ずつ、宣言順に呼ぶ（受け入れは main 側の clean と rebase の間）", () => {
    const { hooks, calls } = fakeHooks()
    expect(runShipPlan(hooks)).toEqual({ outcome: "ok" })
    expect(calls).toEqual([
      "hasOpenClaim",
      "isOwnWorktreeClean",
      "isMainWorktreeClean",
      "review",
      "rebaseOntoMain",
      "verify",
      "mergeFfOnly",
      "syncSubmodules",
    ])
  })

  test("自分の作業ツリーが clean でなければ以降を呼ばない", () => {
    const { hooks, calls } = fakeHooks({ isOwnWorktreeClean: () => false })
    expect(runShipPlan(hooks)).toEqual({ outcome: "own-worktree-dirty" })
    expect(calls).toEqual(["hasOpenClaim", "isOwnWorktreeClean"])
  })

  test.each([
    [
      { kind: "rejected", findings: ["- 指摘: a.ts: 架空の指摘"] },
      { outcome: "review-rejected", findings: ["- 指摘: a.ts: 架空の指摘"] },
    ],
    [
      { kind: "exhausted", findings: ["- 指摘: a.ts: 架空の指摘"] },
      { outcome: "review-exhausted", findings: ["- 指摘: a.ts: 架空の指摘"] },
    ],
    [
      { kind: "unavailable", reason: "上限を超えた" },
      { outcome: "review-unavailable", reason: "上限を超えた" },
    ],
  ] as const)(
    "受け入れの門が止めたら rebase・verify・merge を呼ばない（%o）",
    (review, expected) => {
      const { hooks, calls } = fakeHooks({ review: () => review })
      expect(runShipPlan(hooks)).toEqual(expected)
      expect(calls).toEqual(["hasOpenClaim", "isOwnWorktreeClean", "isMainWorktreeClean", "review"])
    },
  )

  test("受け入れを省いた差分は先へ進む", () => {
    const { hooks, calls } = fakeHooks({ review: () => ({ kind: "skipped" }) })
    expect(runShipPlan(hooks)).toEqual({ outcome: "ok" })
    expect(calls).toContain("mergeFfOnly")
  })

  test("ff-only のやり直しでは受け入れを呼び直さない", () => {
    const { hooks, calls } = fakeHooks({ mergeFfOnly: () => "not-fast-forward" })
    runShipPlan(hooks, 2)
    expect(calls.filter((name) => name === "review")).toHaveLength(1)
  })

  test("main の作業ツリーが clean でなければ rebase 以降を呼ばない", () => {
    const { hooks, calls } = fakeHooks({ isMainWorktreeClean: () => false })
    expect(runShipPlan(hooks)).toEqual({ outcome: "main-worktree-dirty" })
    expect(calls).toEqual(["hasOpenClaim", "isOwnWorktreeClean", "isMainWorktreeClean"])
  })

  test("rebase が衝突したら verify・mergeFfOnly を呼ばない", () => {
    const { hooks, calls } = fakeHooks({ rebaseOntoMain: () => "conflict" })
    expect(runShipPlan(hooks)).toEqual({ outcome: "rebase-conflict" })
    expect(calls).toEqual([
      "hasOpenClaim",
      "isOwnWorktreeClean",
      "isMainWorktreeClean",
      "review",
      "rebaseOntoMain",
    ])
  })

  test("verify が非0なら mergeFfOnly を呼ばない", () => {
    const { hooks, calls } = fakeHooks({ verify: () => 2 })
    expect(runShipPlan(hooks)).toEqual({ outcome: "verify-failed", status: 2 })
    expect(calls).toEqual([
      "hasOpenClaim",
      "isOwnWorktreeClean",
      "isMainWorktreeClean",
      "review",
      "rebaseOntoMain",
      "verify",
    ])
  })

  test("mergeFfOnly が落ち続けると、やり直し上限2回でも通らず rebase・verify が3回ずつ呼ばれる", () => {
    const { hooks, calls } = fakeHooks({ mergeFfOnly: () => "not-fast-forward" })
    expect(runShipPlan(hooks, 2)).toEqual({ outcome: "merge-ff-only-exhausted", attempts: 2 })
    expect(calls.filter((name) => name === "rebaseOntoMain")).toHaveLength(3)
    expect(calls.filter((name) => name === "verify")).toHaveLength(3)
    expect(calls.filter((name) => name === "mergeFfOnly")).toHaveLength(3)
    expect(calls).not.toContain("syncSubmodules")
  })

  test("mergeFfOnly が1回だけ落ちても、やり直して通れば ok になる", () => {
    let mergeCallCount = 0
    const { hooks, calls } = fakeHooks({
      mergeFfOnly: () => {
        mergeCallCount += 1
        return mergeCallCount === 1 ? "not-fast-forward" : "ok"
      },
    })
    expect(runShipPlan(hooks)).toEqual({ outcome: "ok" })
    expect(calls.filter((name) => name === "syncSubmodules")).toHaveLength(1)
  })
})
