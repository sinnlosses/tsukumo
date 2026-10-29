// `report` の `keyFigures`（結論の直下の数の札）が面の頭の値にどう載るか。
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

function headOf(overrides: Parameters<typeof reportEvent>[0]) {
  const entry = mainViewEntries(
    fold([ask, reportEvent({ conclusion: "架空の結論。", ...overrides }), finished]),
  ).find((each) => each.kind === "report")
  return entry?.kind === "report" ? entry.regions.a2ui.head : undefined
}

describe("report の頭の値の keyFigures", () => {
  it("結論と数の札と検証結果を、それぞれ別の値として持つ", () => {
    const head = headOf({ keyFigures, checks })

    expect(head?.lead).toEqual({ kind: "conclusion-lead", text: "架空の結論。" })
    expect(head?.keyFigures.map((figure) => figure.label)).toEqual([
      "架空の数A",
      "架空の数B",
      "架空の数C",
    ])
    expect(head?.checks.kind).toBe("checks")
  })

  it("空なら札を持たない", () => {
    expect(headOf({ keyFigures: [], checks })?.keyFigures).toEqual([])
  })
})
