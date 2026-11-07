import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import { chartConfigOf } from "../../../../../src/browser/features/report/report-diagram-markdown.ts"
import { newLeafHtml } from "../../../../fixture/direct-leaf-compare.tsx"
import { stubIntersectionObserver } from "../../../../fixture/intersection.ts"

beforeAll(async () => {
  stubIntersectionObserver(false)
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type ChartKind = "bar" | "line" | "pie" | "arrow" | "slope" | "span" | "share"

type Overrides = {
  chartKind?: ChartKind
  title?: string
  labels?: string[]
  series?: { name: string; values: number[] }[]
  horizontal?: boolean
  emphasis?: string[]
  fold?: string
  aside?: string
}

type Fields = Required<Overrides>

function pair(overrides: Overrides) {
  const fields: Fields = {
    title: "",
    chartKind: "bar",
    labels: ["架空1", "架空2", "架空3"],
    series: [{ name: "架空系列", values: [3, 1, 2] }],
    horizontal: false,
    emphasis: [],
    fold: "",
    aside: "",
    ...overrides,
  }
  return {
    block: { kind: "chart", ...fields } as const,
    part: { id: "c1", component: "Chart", ...fields } as const,
  }
}

describe("Chart の部品", () => {
  it("横向きの bar は枠の高さを持つ", () => {
    const { block, part } = pair({ horizontal: true })

    expect(newLeafHtml(block, part)).toMatch(/style="height: \d+px;?"/)
  })

  it("labels と series の全部が Chart.js の設定に残る", () => {
    const labels = ["架空1", "架空2", "架空3", "架空4"]
    const series = [
      { name: "架空A", values: [1, 2, 3, 4] },
      { name: "架空B", values: [4, 3, 2, 1] },
    ]
    const { block } = pair({ chartKind: "line", labels, series })

    const config = JSON.stringify(chartConfigOf(block))

    const expected = [...labels, ...series.map((one) => one.name)]
    expect(expected.filter((text) => !config.includes(text))).toEqual([])
    expect(config.includes("架空5")).toBe(false)
  })
})
