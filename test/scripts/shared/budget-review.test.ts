import { describe, expect, test } from "vitest"

import { budgetDrafts, type BudgetMeasurement } from "../../../scripts/shared/budget-review.ts"

const REVIEWED_ON = "2026-01-01"
const BEFORE_DUE = { today: REVIEWED_ON, reviewedOn: REVIEWED_ON }

function measurement(overrides: Partial<BudgetMeasurement>): BudgetMeasurement {
  return {
    name: "AGENTS.md",
    unit: "字",
    current: 100,
    limit: 200,
    constant: "`AGENTS_MD_LIMIT`",
    details: [],
    ...overrides,
  }
}

function on(today: string) {
  return { today, reviewedOn: REVIEWED_ON }
}

describe("超えた上限のドラフト", () => {
  test("上限ちょうどは積まず、1 超えると題に実測と上限を入れて積む", () => {
    expect(budgetDrafts([measurement({ current: 200 })], [], BEFORE_DUE)).toEqual([])

    const [draft] = budgetDrafts([measurement({ current: 201 })], [], BEFORE_DUE)

    expect(draft?.summary).toBe("上限超過: AGENTS.md（201字／上限 200字）を見直す")
    expect(draft?.body).toContain("## 目的・背景")
    expect(draft?.body).toContain("1字超え")
    expect(draft?.body).toContain("`AGENTS_MD_LIMIT`")
  })

  test("同じ上限のドラフトが開いていれば、実測が変わっていても積み直さない", () => {
    const open = ["上限超過: AGENTS.md（230字／上限 200字）を見直す"]

    expect(budgetDrafts([measurement({ current: 250 })], open, BEFORE_DUE)).toEqual([])
  })

  test("本文に上限ごとの補足の行を足す", () => {
    const [draft] = budgetDrafts(
      [measurement({ unit: "件", current: 1, limit: 0, details: ["`src/a.ts`: 6100 トークン"] })],
      [],
      BEFORE_DUE,
    )

    expect(draft?.body).toContain("- `src/a.ts`: 6100 トークン")
  })
})

describe("定期見直しのドラフト", () => {
  test("前回の見直しから 30 日で積み、29 日では積まない", () => {
    expect(budgetDrafts([measurement({})], [], on("2026-01-30"))).toEqual([])

    const [draft] = budgetDrafts([measurement({})], [], on("2026-01-31"))

    expect(draft?.summary).toMatch(/^上限の定期見直し: /)
    expect(draft?.body).toContain("2026-01-01")
    expect(draft?.body).toContain("AGENTS.md: 100字／上限 200字（残り 100字）")
  })

  test("開いた定期見直しがあれば積み直さない", () => {
    const [draft] = budgetDrafts([measurement({})], [], on("2026-01-31"))

    expect(budgetDrafts([measurement({})], [draft?.summary ?? ""], on("2026-02-01"))).toEqual([])
  })
})
