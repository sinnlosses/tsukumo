import { describe, expect, it } from "vitest"

import { nextChartItem } from "../../../../../src/browser/features/report/renderer/chart-item-key.ts"

describe("nextChartItem", () => {
  it("ArrowRight は無ければ先頭、あれば次へ進み、末尾で止まる", () => {
    expect(nextChartItem("ArrowRight", 3)).toEqual({ kind: "show", index: 0 })
    expect(nextChartItem("ArrowRight", 3, 0)).toEqual({ kind: "show", index: 1 })
    expect(nextChartItem("ArrowRight", 3, 2)).toEqual({ kind: "show", index: 2 })
  })

  it("ArrowLeft は無ければ末尾、あれば前へ戻り、先頭で止まる", () => {
    expect(nextChartItem("ArrowLeft", 3)).toEqual({ kind: "show", index: 2 })
    expect(nextChartItem("ArrowLeft", 3, 2)).toEqual({ kind: "show", index: 1 })
    expect(nextChartItem("ArrowLeft", 3, 0)).toEqual({ kind: "show", index: 0 })
  })

  it("Home・End は先頭・末尾", () => {
    expect(nextChartItem("Home", 3, 1)).toEqual({ kind: "show", index: 0 })
    expect(nextChartItem("End", 3, 1)).toEqual({ kind: "show", index: 2 })
  })

  it("Escape は札を消す", () => {
    expect(nextChartItem("Escape", 3, 1)).toEqual({ kind: "hide" })
  })

  it("項目が1つの図は動かない", () => {
    expect(nextChartItem("ArrowRight", 1, 0)).toEqual({ kind: "show", index: 0 })
    expect(nextChartItem("ArrowLeft", 1)).toEqual({ kind: "show", index: 0 })
  })

  it("項目が0や未知のキーは無視する", () => {
    expect(nextChartItem("ArrowRight", 0)).toEqual({ kind: "ignore" })
    expect(nextChartItem("Escape", 0)).toEqual({ kind: "ignore" })
    expect(nextChartItem("a", 3, 0)).toEqual({ kind: "ignore" })
  })
})
