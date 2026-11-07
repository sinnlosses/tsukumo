import { describe, expect, it } from "vitest"

import {
  reportRejectionText,
  reportViolations,
} from "../../../../../src/server/report/core/rules/report-violation.ts"
import type { LeafComponent } from "../../../../../src/shared/report/report-block.ts"
import { draft } from "../../../../fixture/report-draft-block.ts"

describe("表の行の best", () => {
  it.each([
    ["先頭の列", 0, undefined, undefined, []],
    ["最後の列", 1, undefined, undefined, []],
    ["欄なし", undefined, undefined, undefined, []],
    ["列の数と同じ位置", 2, undefined, undefined, [{ kind: "best-column-range", count: 1 }]],
    [
      "totals の計の列の位置",
      2,
      { from: 1, to: 1 },
      true,
      [{ kind: "best-column-range", count: 1 }],
    ],
  ] as const)("%s", (_, best, heat, totals, expected) => {
    const table: LeafComponent = {
      kind: "table",
      title: "架空の表",
      columns: ["列", "値"],
      rows: [best === undefined ? ["a", "1"] : { cells: ["a", "1"], best }],
      rest: "",
      fold: "",
      aside: "",
      heat,
      totals,
    }
    const violations = reportViolations(draft([table]))
    expect(violations).toEqual(expected)
    if (expected.length > 0) {
      expect(reportRejectionText(violations)).toContain("`best`")
    }
  })
})
