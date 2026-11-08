import { describe, expect, it } from "vitest"

import {
  chartPartsOfSection,
  chartTermLinksOf,
  chartTermSpans,
} from "../../../../../src/browser/features/report/domain/chart-term-link.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"

describe("語の揃え方", () => {
  it("空白を除き、全角半角を揃えた字を語にする", () => {
    expect([...chartTermLinksOf([{ id: "c1", labels: ["６ 本"] }]).keys()]).toEqual(["6本"])
  })
})

describe("chartTermLinksOf", () => {
  it("項目名を揃えた語から図と位置を引ける", () => {
    const links = chartTermLinksOf([{ id: "c1", labels: ["架空1月", "架空 2月"] }])
    expect(links.get("架空2月")).toEqual({ chartId: "c1", index: 1 })
  })

  it("1字の語は結ばない", () => {
    expect(chartTermLinksOf([{ id: "c1", labels: ["a", "架空"] }]).has("a")).toBe(false)
  })

  it("2つの図に同じ項目名があれば結ばない。同じ図の中の重複は先頭を採る", () => {
    const links = chartTermLinksOf([
      { id: "c1", labels: ["架空A", "架空A", "架空B"] },
      { id: "c2", labels: ["架空B"] },
    ])
    expect(links.get("架空A")).toEqual({ chartId: "c1", index: 0 })
    expect(links.has("架空B")).toBe(false)
  })
})

describe("chartPartsOfSection", () => {
  const chart = (id: string) =>
    ({
      id,
      component: "Chart",
      chartKind: "bar",
      title: "架空",
      horizontal: false,
      emphasis: [],
      fold: "",
      aside: "",
      labels: ["架空"],
      series: [{ name: "s", values: [1] }],
    }) satisfies A2uiReportComponent
  const parts = new Map<string, A2uiReportComponent>([
    ["c1", chart("c1")],
    ["c2", chart("c2")],
    [
      "g1",
      {
        id: "g1",
        component: "ChartGrid",
        chartKind: "line",
        title: "架空",
        fold: "",
        aside: "",
        labels: ["a"],
        panels: [{ heading: "甲", series: [{ name: "s", values: [1] }] }],
      },
    ],
    ["row", { id: "row", component: "Row", children: ["c1", "g1"] }],
    ["tabs", { id: "tabs", component: "Tabs", tabs: [{ title: "架空", child: "c2" }] }],
  ])

  it("入れ子の Row と Tabs の中の Chart を集め、ChartGrid は集めない", () => {
    expect(chartPartsOfSection(["row", "tabs"], parts).map((part) => part.id)).toEqual(["c1", "c2"])
  })

  it("ChartGrid だけの節は空", () => {
    expect(chartPartsOfSection(["g1"], parts)).toEqual([])
  })
})

describe("chartTermSpans", () => {
  const terms = chartTermLinksOf([{ id: "c1", labels: ["6本", "架空1月"] }])

  it("空白を挟んだ字・全角の字にも当たり、位置は元の字のもの", () => {
    const text = "前に 6 本 と ６本"
    const spans = chartTermSpans(text, terms)
    expect(spans.map((span) => text.slice(span.start, span.end))).toEqual(["6 本", "６本"])
  })

  it("長い語を先に採り、重ならない", () => {
    const longer = chartTermLinksOf([{ id: "c1", labels: ["架空1月", "架空1月分"] }])
    const spans = chartTermSpans("架空1月分", longer)
    expect(spans).toEqual([{ start: 0, end: 5, term: "架空1月分" }])
  })
})
