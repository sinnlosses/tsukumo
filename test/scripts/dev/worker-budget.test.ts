import { describe, expect, test } from "vitest"

import { workerBudget, workersPerStage } from "../../../scripts/dev/lib/worker-budget.ts"

describe("workersPerStage", () => {
  test.each([
    { cores: 1, stages: 1, perStage: 1 },
    { cores: 4, stages: 1, perStage: 2 },
    { cores: 8, stages: 1, perStage: 3 },
    { cores: 10, stages: 1, perStage: 4 },
    { cores: 12, stages: 1, perStage: 5 },
    { cores: 16, stages: 1, perStage: 6 },
    { cores: 20, stages: 1, perStage: 8 },
    { cores: 10, stages: 2, perStage: 2 },
    { cores: 10, stages: 4, perStage: 1 },
  ])("$cores コア・$stages 本は $perStage ずつ配る", ({ cores, stages, perStage }) => {
    expect(workersPerStage(workerBudget(cores, undefined), stages)).toBe(perStage)
  })
})

describe("workerBudget", () => {
  test("既定は10コアで8、正の整数の上書きは予算になり、読めない値は無視する", () => {
    expect(workerBudget(10, undefined)).toBe(8)
    expect(workerBudget(10, "4")).toBe(4)
    expect(workerBudget(10, "0")).toBe(8)
    expect(workerBudget(10, "abc")).toBe(8)
    expect(workerBudget(10, "")).toBe(8)
  })
})
