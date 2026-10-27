import { readFileSync } from "node:fs"

import { describe, expect, test } from "vitest"

import {
  FIGURE_DECISION_TABLES,
  readMarkedRows,
  rewriteFigureDecisionTables,
} from "../../../scripts/document/figure-decision-table.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"

const CRITERIA = readFileSync(
  `${REPOSITORY_ROOT}/docs/architecture/display/block-criteria.md`,
  "utf8",
)

describe("rewriteFigureDecisionTables", () => {
  test("印に挟まれた範囲を、それぞれの表に書き直す", () => {
    const text = FIGURE_DECISION_TABLES.map(
      (table) => `前\n${table.start}\n古い\n${table.end}\n後\n`,
    ).join("")
    const rewritten = rewriteFigureDecisionTables(text)

    for (const table of FIGURE_DECISION_TABLES) {
      expect(readMarkedRows(rewritten, table)).toEqual(table.rows)
    }
  })

  test("印が無い文書は変えない", () => {
    expect(rewriteFigureDecisionTables("本文\n")).toBe("本文\n")
  })
})

describe("塊の基準の「図の決定表」の表", () => {
  test.each(FIGURE_DECISION_TABLES)(
    "$start の表は決定表から書き直した行と同じ（pnpm run format で直す）",
    (table) => {
      expect(readMarkedRows(CRITERIA, table)).toEqual(table.rows)
    },
  )

  test("手で1セル直した表は、決定表の行と食い違う", () => {
    const [table] = FIGURE_DECISION_TABLES
    const edited = CRITERIA.replace("`one-value`", "`single-value`")

    expect(edited).not.toBe(CRITERIA)
    expect(readMarkedRows(edited, table)).not.toEqual(table.rows)
  })
})
