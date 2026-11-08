import { describe, expect, it, vi } from "vitest"

import { tooltipControlOf } from "../../../../../src/browser/features/report/renderer/chart-tooltip.ts"

const labels = ["A", "B"]

function fakeChart(datasets: { label?: string; data: unknown[] }[]) {
  return {
    data: { labels, datasets },
    tooltip: { setActiveElements: vi.fn<(active: unknown, position: unknown) => void>() },
    setActiveElements: vi.fn<(active: unknown) => void>(),
    update: vi.fn<() => void>(),
  }
}

const TWO_SERIES = [
  { label: "x", data: [1, 2] },
  { label: "y", data: [3, 4] },
]

describe("tooltipControlOf", () => {
  it("show は項目の全系列を札と chart に渡して更新し、読み上げへ同じ字を渡す", () => {
    const chart = fakeChart(TWO_SERIES)
    const announce = vi.fn<(text: string) => void>()

    tooltipControlOf(chart, announce).show(1)

    const active = [
      { datasetIndex: 0, index: 1 },
      { datasetIndex: 1, index: 1 },
    ]
    expect(chart.tooltip.setActiveElements).toHaveBeenCalledWith(active, expect.anything())
    expect(chart.setActiveElements).toHaveBeenCalledWith(active)
    expect(chart.update).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith("B\nx 2\ny 4")
  })

  it("系列が1つなら項目名と値の2行を読み上げる", () => {
    const announce = vi.fn<(text: string) => void>()

    tooltipControlOf(fakeChart([{ label: "x", data: [1, 2] }]), announce).show(0)

    expect(announce).toHaveBeenCalledWith("A\nx 1")
  })

  it("範囲外の show は何もしない", () => {
    const chart = fakeChart(TWO_SERIES)
    const announce = vi.fn<(text: string) => void>()

    tooltipControlOf(chart, announce).show(2)

    expect(chart.setActiveElements).not.toHaveBeenCalled()
    expect(announce).not.toHaveBeenCalled()
  })

  it("hide は空配列を渡して読み上げを空にする", () => {
    const chart = fakeChart(TWO_SERIES)
    const announce = vi.fn<(text: string) => void>()

    tooltipControlOf(chart, announce).hide()

    expect(chart.setActiveElements).toHaveBeenCalledWith([])
    expect(chart.tooltip.setActiveElements).toHaveBeenCalledWith([], expect.anything())
    expect(announce).toHaveBeenCalledWith("")
  })
})
