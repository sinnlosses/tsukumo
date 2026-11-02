import { describe, expect, test } from "vitest"

import {
  choiceTrialConditions,
  guideClause,
  guideSystemClause,
  summarizeChoice,
  type ChoiceResult,
} from "../../../../scripts/dev/lib/a2ui-choice-trial.ts"
import {
  REPORT_NOTATION_PROMPT,
  REPORT_PART_CHOICE_GUIDE,
} from "../../../../src/server/report/core/report-notation.ts"

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

  test("条件は形を指定しない題材 × 手引き 4 通り × 2 回で、id が重ならない", () => {
    const conditions = choiceTrialConditions()

    expect(conditions).toHaveLength(32)
    expect(new Set(conditions.map((condition) => condition.id)).size).toBe(32)
    expect(conditions.every((condition) => condition.loading === "full")).toBe(true)
  })

  test("手引きは none で何も足さず、decide は declare の文に記法の条の文面を足す", () => {
    expect(guideClause("none")).toBe("")
    expect(guideClause("declare")).toContain("DECLARE 材料の形")
    expect(guideClause("decide").startsWith(guideClause("declare"))).toBe(true)
    expect(guideClause("decide")).toContain(REPORT_PART_CHOICE_GUIDE)
  })

  test("shipped は依頼文に足さず、system prompt の末尾に記法の条の文面だけを足す", () => {
    expect(guideClause("shipped")).toBe("")
    expect(guideSystemClause("shipped")).toBe(`\n\n${REPORT_PART_CHOICE_GUIDE}`)
    expect(guideSystemClause("decide")).toBe("")
    expect(REPORT_NOTATION_PROMPT).toContain(REPORT_PART_CHOICE_GUIDE)
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
