// `report` の `keyFigures`（結論の直下の数の札）が頭の欄にどう組まれるか。
import { describe, expect, it } from "vitest"

import type { ReportCheck } from "../../../src/shared/report/report-check.ts"
import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import { ask, finished, fold } from "../../fixture/main-view-report.ts"
import { reportEvent } from "../../fixture/report-event.ts"

const keyFigures = ["架空の数A", "架空の数B", "架空の数C"].map((label, index) => ({
  before: "",
  value: String(index + 1),
  total: "",
  label,
  series: [],
  better: "" as const,
}))
const checks: readonly ReportCheck[] = [
  { status: "ok", label: "架空の検査", figure: "", command: "", detail: "", howToVerify: "" },
]

function headOf(overrides: Parameters<typeof reportEvent>[0]): string {
  const entry = mainViewEntries(
    fold([ask, reportEvent({ conclusion: "架空の結論。", ...overrides }), finished]),
  ).find((each) => each.kind === "report")
  return entry?.kind === "report" ? entry.regions.head : ""
}

describe("report の頭の欄の keyFigures", () => {
  it("結論 → keyFigures → 検証結果 の順に組む", () => {
    const head = headOf({ keyFigures, checks })

    const positions = [
      head.indexOf('class="conclusion-lead"'),
      head.indexOf('class="key-figures"'),
      head.indexOf('class="status"'),
    ]
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
    expect(head.match(/class="stat"/g)).toHaveLength(3)
  })

  it("空なら札の包みを出さない", () => {
    expect(headOf({ keyFigures: [], checks })).not.toContain("key-figures")
  })
})
