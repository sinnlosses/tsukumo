import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { chartConfigOf } from "../../../../../../../src/shared/report/report-diagram-markdown.ts"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"
import { stubIntersectionObserver } from "../../../../../../fixture/intersection.ts"

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

function both(overrides: Overrides) {
  const { block, part } = pair(overrides)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

const TWO_SERIES = [
  { name: "架空の前", values: [9, 8, 7] },
  { name: "架空の後", values: [4, 3, 2] },
]

describe("Chart の部品", () => {
  it.each([
    ["題つきの bar", { title: "架空の題" }],
    ["題なしの bar", {}],
    ["横向きの bar", { horizontal: true }],
    ["emphasis つきの bar", { emphasis: ["架空2"] }],
    ["line", { chartKind: "line", series: TWO_SERIES }],
    ["pie", { chartKind: "pie", emphasis: ["架空1"] }],
    ["arrow", { chartKind: "arrow", series: TWO_SERIES }],
    ["slope", { chartKind: "slope", series: TWO_SERIES }],
    ["span", { chartKind: "span", series: TWO_SERIES }],
    ["share", { chartKind: "share", emphasis: ["架空1"] }],
    ["fold つき", { title: "架空の題", fold: "架空の畳み" }],
    ["aside つき", { title: "架空の題", aside: "架空の傍注" }],
    ["fold と aside の両方", { fold: "架空の畳み", aside: "架空の傍注" }],
  ] as const satisfies readonly (readonly [string, Overrides])[])(
    "%s が旧い描画と一致する",
    (_name, overrides) => {
      const { fresh, old } = both(overrides)

      expect(fresh).toBe(old)
      expect(fresh).toContain("chart-block")
    },
  )

  it("横向きの bar は枠の高さを持つ", () => {
    expect(both({ horizontal: true }).fresh).toMatch(/style="height: \d+px;?"/)
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
