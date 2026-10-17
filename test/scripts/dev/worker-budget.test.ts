import { describe, expect, test } from "vitest"

import { workerBudget, workersPerStage } from "../../../scripts/dev/lib/worker-budget.ts"

describe("workersPerStage", () => {
  const budget = workerBudget(10, undefined)

  test("10 コアの既定の予算は4で、1本なら単体と E2E に2ずつ配る", () => {
    expect(budget).toBe(4)
    expect(workersPerStage(budget, 1)).toBe(2)
  })

  test("2本なら1ずつに割る", () => {
    expect(workersPerStage(budget, 2)).toBe(1)
  })

  test("4本でも最小の1を下回らない", () => {
    expect(workersPerStage(budget, 4)).toBe(1)
  })
})

describe("1本のときの配り数", () => {
  test.each([
    { cores: 1, perStage: 1 },
    { cores: 4, perStage: 1 },
    { cores: 8, perStage: 1 },
    { cores: 10, perStage: 2 },
    { cores: 12, perStage: 2 },
    { cores: 16, perStage: 2 },
    { cores: 20, perStage: 3 },
  ])("$cores コアは maxWorkers 15% と同じ $perStage", ({ cores, perStage }) => {
    expect(workersPerStage(workerBudget(cores, undefined), 1)).toBe(perStage)
  })
})

describe("workerBudget", () => {
  test("正の整数の上書きは予算になり、読めない値は無視する", () => {
    expect(workerBudget(10, "8")).toBe(8)
    expect(workerBudget(10, "0")).toBe(4)
    expect(workerBudget(10, "abc")).toBe(4)
    expect(workerBudget(10, "")).toBe(4)
  })
})
