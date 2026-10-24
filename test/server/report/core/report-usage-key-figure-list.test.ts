// 使われ方の記録の `keyFigures` の有無と、結論に数が並ぶのに `keyFigures` が無い回の判定。
import { describe, expect, it } from "vitest"

import { reportUsageEntryOf } from "../../../../src/server/report/core/report-usage.ts"
import { reportEvent } from "../../../fixture/report-event.ts"

const keyFigures = ["A", "B", "C"].map((label, index) => ({
  before: "",
  value: String(index),
  total: "",
  label,
  series: [],
  better: "" as const,
}))

function usageOf(conclusion: string, withKeyFigures: boolean) {
  const entry = reportUsageEntryOf(
    reportEvent({ conclusion, keyFigures: withKeyFigures ? keyFigures : [] }),
    "fictional-session",
    0,
    false,
  )
  return [entry.hasKeyFigures, entry.conclusionNumbersWithoutKeyFigures]
}

describe("reportUsageEntryOf の keyFigures", () => {
  it.each([
    {
      name: "あり × 数3つ",
      conclusion: "架空の結論は 14 件・20 件・9 件。",
      given: true,
      want: [true, false],
    },
    {
      name: "なし × 数3つ（コードの外）",
      conclusion: "架空の結論は 14 件・20 件・9 件。",
      given: false,
      want: [false, true],
    },
    {
      name: "なし × 数3つ（コードの中）",
      conclusion: "架空の `14 20 9` の結論。",
      given: false,
      want: [false, false],
    },
    {
      name: "なし × 数2つ",
      conclusion: "架空の結論は 14 件・20 件。",
      given: false,
      want: [false, false],
    },
  ])("$name", ({ conclusion, given, want }) => {
    expect(usageOf(conclusion, given)).toEqual(want)
  })
})
