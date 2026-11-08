import { cleanup, render, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartLeaf } from "../../../../../src/browser/features/report/leaf/chart-leaf.tsx"
import {
  ChartTermLinkScope,
  useChartTermLink,
  type ChartTermLink,
} from "../../../../../src/browser/features/report/leaf/chart-term-link.tsx"
import { loadMarkdown } from "../../../../../src/browser/features/report/markdown.tsx"
import { chartConfigOf } from "../../../../../src/browser/features/report/report-diagram-markdown.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import { newLeafHtml, PLAIN_LEAF_VALUE } from "../../../../fixture/direct-leaf-compare.tsx"
import { stubIntersectionObserver } from "../../../../fixture/intersection.ts"

// jsdom には canvas が無く、色のトークンも解けない。
vi.mock("../../../../../src/browser/features/report/renderer/theme-color.ts", () => ({
  resolveColor: () => "rgb(0, 0, 0)",
  resolveColorMix: () => "rgb(0, 0, 0)",
  resolveHex: () => "#000000",
  resolveHexOver: () => "#000000",
}))

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

describe("Chart の札を節の外から出す", () => {
  const part = {
    id: "c1",
    component: "Chart",
    chartKind: "bar",
    title: "",
    labels: ["架空1", "架空2"],
    series: [{ name: "架空系列", values: [3, 1] }],
    horizontal: false,
    emphasis: [],
    fold: "",
    aside: "",
  } as const satisfies A2uiReportComponent

  const activeCalls: unknown[] = []
  const scripts: Node[] = []

  class FakeChart {
    static readonly defaults = {
      color: "",
      maintainAspectRatio: true,
      font: { family: "" },
      scale: { grid: { color: "", display: true }, border: { color: "" }, ticks: { color: "" } },
      plugins: { colors: { enabled: true }, legend: { display: true } },
      set: vi.fn<() => void>(),
    }
    static readonly register = vi.fn<() => void>()
    readonly data = { labels: ["架空1", "架空2"], datasets: [{ label: "架空系列", data: [3, 1] }] }
    readonly tooltip = { setActiveElements: vi.fn<(active: unknown, position: unknown) => void>() }
    readonly destroy = vi.fn<() => void>()
    readonly update = vi.fn<() => void>()
    readonly setActiveElements = (active: unknown): void => {
      activeCalls.push(active)
    }
  }

  beforeEach(() => {
    stubIntersectionObserver(true)
    activeCalls.length = 0
    scripts.length = 0
    vi.stubGlobal("Chart", FakeChart)
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      if (node.nodeName === "SCRIPT") {
        scripts.push(node)
      }
      return node
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("入れ物の中の ChartLeaf は、図の ID で show と hide が届く", async () => {
    const links: ChartTermLink[] = []
    function Probe(): ReactElement {
      links.push(useChartTermLink())
      return <ChartLeaf part={part} value={PLAIN_LEAF_VALUE} />
    }
    render(
      <ChartTermLinkScope charts={[{ id: "c1", labels: part.labels }]}>
        <Probe />
      </ChartTermLinkScope>,
    )
    for (const script of scripts) {
      script.dispatchEvent(new Event("load"))
    }
    const link = (): ChartTermLink | undefined => links.at(-1)
    await waitFor(() => {
      link()?.show("c1", 1)
      expect(activeCalls.length).toBeGreaterThan(0)
    })

    expect(activeCalls.at(-1)).toEqual([{ datasetIndex: 0, index: 1 }])
    const before = activeCalls.length
    link()?.hide("c1")

    expect(activeCalls.length).toBeGreaterThan(before)
    expect(activeCalls.at(-1)).toEqual([])
  })

  it("入れ物が無い ChartLeaf の HTML は、入れ物の中と同じ", () => {
    const alone = renderToStaticMarkup(<ChartLeaf part={part} value={PLAIN_LEAF_VALUE} />)
    const scoped = renderToStaticMarkup(
      <ChartTermLinkScope charts={[]}>
        <ChartLeaf part={part} value={PLAIN_LEAF_VALUE} />
      </ChartTermLinkScope>,
    )

    expect(scoped).toBe(alone)
  })
})
