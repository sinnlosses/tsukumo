import { describe, expect, test } from "vitest"

import {
  choiceTrialConditions,
  guideClause,
  summarizeChoice,
  type ChoiceResult,
} from "../../../../scripts/dev/lib/a2ui-choice-trial.ts"

describe("部品の選びの測定", () => {
  const caseOf = (
    guide: ChoiceResult["guide"],
    componentNames: readonly string[],
  ): ChoiceResult => ({
    guide,
    firstFaults: [],
    componentNames,
    firstChars: componentNames.length * 100,
  })

  test("条件は形を指定しない題材 × 手引き 3 通り × 2 回で、id が重ならない", () => {
    const conditions = choiceTrialConditions()

    expect(conditions).toHaveLength(24)
    expect(new Set(conditions.map((condition) => condition.id)).size).toBe(24)
    expect(conditions.every((condition) => condition.loading === "full")).toBe(true)
  })

  test("手引きは none で何も足さず、decide は declare の文に目安を足す", () => {
    expect(guideClause("none")).toBe("")
    expect(guideClause("declare")).toContain("DECLARE 材料の形")
    expect(guideClause("decide").startsWith(guideClause("declare"))).toBe(true)
    expect(guideClause("decide")).toContain("Compare")
  })

  test("手引きごとに、Table・配置・図の部品を使った件数を数える", () => {
    const rows = summarizeChoice([
      caseOf("none", ["Report", "Section", "Table"]),
      caseOf("none", ["Report", "Section", "Table", "Paragraph"]),
      caseOf("declare", ["Report", "Section", "Compare", "Row", "Card"]),
      caseOf("declare", []),
    ])

    expect(rows).toEqual([
      {
        guide: "declare",
        count: 2,
        readable: 1,
        firstPass: 2,
        table: 0,
        layout: 1,
        figure: 1,
        kinds: 5,
        chars: 250,
      },
      {
        guide: "none",
        count: 2,
        readable: 2,
        firstPass: 2,
        table: 2,
        layout: 0,
        figure: 0,
        kinds: 3.5,
        chars: 350,
      },
    ])
  })
})
