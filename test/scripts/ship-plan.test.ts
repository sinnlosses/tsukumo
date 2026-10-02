// 取り込み・検証・送り出しの順序とやり直しの上限を、偽のフックで検証する。

import { describe, expect, test } from "vitest"

import { runShipPlan, type ShipPlanHooks } from "../../scripts/lib/ship-plan.ts"

function fakeHooks(overrides: Partial<ShipPlanHooks> = {}): {
  readonly hooks: ShipPlanHooks
  readonly calls: string[]
} {
  const calls: string[] = []
  const hooks: ShipPlanHooks = {
    isOwnWorktreeClean: () => {
      calls.push("isOwnWorktreeClean")
      return overrides.isOwnWorktreeClean?.() ?? true
    },
    isMainWorktreeClean: () => {
      calls.push("isMainWorktreeClean")
      return overrides.isMainWorktreeClean?.() ?? true
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
  }
  return { hooks, calls }
}

describe("runShipPlan", () => {
  test("正常系は5つのフックを1回ずつ、宣言順に呼ぶ", () => {
    const { hooks, calls } = fakeHooks()
    expect(runShipPlan(hooks)).toEqual({ outcome: "ok" })
    expect(calls).toEqual([
      "isOwnWorktreeClean",
      "isMainWorktreeClean",
      "rebaseOntoMain",
      "verify",
      "mergeFfOnly",
    ])
  })

  test("自分の作業ツリーが clean でなければ以降を呼ばない", () => {
    const { hooks, calls } = fakeHooks({ isOwnWorktreeClean: () => false })
    expect(runShipPlan(hooks)).toEqual({ outcome: "own-worktree-dirty" })
    expect(calls).toEqual(["isOwnWorktreeClean"])
  })

  test("main の作業ツリーが clean でなければ rebase 以降を呼ばない", () => {
    const { hooks, calls } = fakeHooks({ isMainWorktreeClean: () => false })
    expect(runShipPlan(hooks)).toEqual({ outcome: "main-worktree-dirty" })
    expect(calls).toEqual(["isOwnWorktreeClean", "isMainWorktreeClean"])
  })

  test("rebase が衝突したら verify・mergeFfOnly を呼ばない", () => {
    const { hooks, calls } = fakeHooks({ rebaseOntoMain: () => "conflict" })
    expect(runShipPlan(hooks)).toEqual({ outcome: "rebase-conflict" })
    expect(calls).toEqual(["isOwnWorktreeClean", "isMainWorktreeClean", "rebaseOntoMain"])
  })

  test("verify が非0なら mergeFfOnly を呼ばない", () => {
    const { hooks, calls } = fakeHooks({ verify: () => 2 })
    expect(runShipPlan(hooks)).toEqual({ outcome: "verify-failed", status: 2 })
    expect(calls).toEqual(["isOwnWorktreeClean", "isMainWorktreeClean", "rebaseOntoMain", "verify"])
  })

  test("mergeFfOnly が落ち続けると、やり直し上限2回でも通らず rebase・verify が3回ずつ呼ばれる", () => {
    const { hooks, calls } = fakeHooks({ mergeFfOnly: () => "not-fast-forward" })
    expect(runShipPlan(hooks, 2)).toEqual({ outcome: "merge-ff-only-exhausted", attempts: 2 })
    expect(calls.filter((name) => name === "rebaseOntoMain")).toHaveLength(3)
    expect(calls.filter((name) => name === "verify")).toHaveLength(3)
    expect(calls.filter((name) => name === "mergeFfOnly")).toHaveLength(3)
  })

  test("mergeFfOnly が1回だけ落ちても、やり直して通れば ok になる", () => {
    let mergeCallCount = 0
    const { hooks } = fakeHooks({
      mergeFfOnly: () => {
        mergeCallCount += 1
        return mergeCallCount === 1 ? "not-fast-forward" : "ok"
      },
    })
    expect(runShipPlan(hooks)).toEqual({ outcome: "ok" })
  })
})
