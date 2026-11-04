import { describe, expect, it } from "vitest"

import { chartConfigOf } from "../../../../../../src/browser/components/page/conversation/domain/report-diagram-markdown.ts"
import type { ReportBlock } from "../../../../../../src/shared/report/report-block.ts"
import { fencedFigureCaptioned, markdownOf } from "../../../../../fixture/report-markdown.ts"

type ChartBlock = Extract<ReportBlock, { readonly kind: "chart" }>

describe("reportSectionsMarkdown", () => {
  it("sequenceDiagram の mermaid には autonumber を1つだけ足し、既にあるものと別の種類は変えない", () => {
    const mermaidOf = (source: string): string =>
      markdownOf({ kind: "mermaid", title: "", source, fold: "", aside: "" })

    const numbered = fencedFigureCaptioned(
      "```mermaid\nsequenceDiagram\n  autonumber\n  A ->> B: x\n```",
    )

    expect(mermaidOf("sequenceDiagram\n  A ->> B: x")).toBe(numbered)
    expect(mermaidOf("sequenceDiagram\n  autonumber\n  A ->> B: x")).toBe(numbered)
    expect(mermaidOf("stateDiagram-v2\n  [*] --> A")).toBe(
      fencedFigureCaptioned("```mermaid\nstateDiagram-v2\n  [*] --> A\n```"),
    )
  })
})

describe("chartConfigOf", () => {
  const labels = ["架空A", "架空B"]
  const one = [{ name: "架空系列", values: [1, 2] }]
  const two = [
    { name: "架空系列1", values: [1, 2] },
    { name: "架空系列2", values: [3, 4] },
  ]
  const pair = [
    { name: "架空の前", values: [1, 2] },
    { name: "架空の後", values: [3, 0] },
  ]
  const direct = (mode: "arrow" | "slope" | "span") => ({
    "tsukumo-direct-label": { mode, names: ["架空の前", "架空の後"] },
  })
  const shareOptions = {
    indexAxis: "y",
    scales: {
      x: { stacked: true, display: false, min: 0, max: 100 },
      y: { stacked: true, display: false },
    },
    plugins: { "tsukumo-direct-label": { mode: "share", names: [] } },
  }
  const chartOf = (
    chartKind: ChartBlock["chartKind"],
    series: ChartBlock["series"],
    horizontal: boolean,
    chartLabels: readonly string[] = labels,
    emphasis: readonly string[] = [],
  ): ChartBlock => ({
    kind: "chart",
    title: "",
    chartKind,
    labels: chartLabels,
    series,
    horizontal,
    emphasis,
    fold: "",
    aside: "",
  })

  it.each([
    [
      "bar",
      "bar",
      one,
      false,
      {
        type: "bar",
        data: { labels, datasets: [{ label: "架空系列", data: [1, 2] }] },
        options: {},
      },
    ],
    [
      "bar の horizontal は indexAxis を y にし、目盛りを間引かず高さを添える",
      "bar",
      one,
      true,
      {
        type: "bar",
        data: { labels, datasets: [{ label: "架空系列", data: [1, 2] }] },
        options: { indexAxis: "y", scales: { y: { ticks: { autoSkip: false } } } },
        tsukumo: { height: 320 },
      },
    ],
    [
      "line の horizontal は軸を変えない",
      "line",
      one,
      true,
      {
        type: "line",
        data: { labels, datasets: [{ label: "架空系列", data: [1, 2] }] },
        options: {},
      },
    ],
    [
      "line は系列ごとに1本",
      "line",
      two,
      false,
      {
        type: "line",
        data: {
          labels,
          datasets: [
            { label: "架空系列1", data: [1, 2] },
            { label: "架空系列2", data: [3, 4] },
          ],
        },
        options: {},
      },
    ],
    [
      "pie は先頭の系列だけを使う",
      "pie",
      two,
      false,
      {
        type: "pie",
        data: { labels, datasets: [{ label: "架空系列1", data: [1, 2] }] },
        options: {},
      },
    ],
    [
      "arrow は項目ごとの前→後を浮き棒にして系列名を plugin に渡す",
      "arrow",
      pair,
      false,
      {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "架空の前 → 架空の後",
              data: [
                [1, 3],
                [2, 0],
              ],
              barThickness: 4,
            },
          ],
        },
        options: {
          indexAxis: "y",
          scales: { y: { display: false } },
          plugins: direct("arrow"),
        },
      },
    ],
    [
      "slope は項目ごとの線にして系列名を plugin に渡す",
      "slope",
      pair,
      false,
      {
        type: "line",
        data: {
          labels: ["架空の前", "架空の後"],
          datasets: [
            { label: "架空A", data: [1, 3] },
            { label: "架空B", data: [2, 0] },
          ],
        },
        options: { scales: { y: { display: false } }, plugins: direct("slope") },
      },
    ],
    [
      "span は項目ごとの始まり〜終わりを太い浮き棒にして系列名を plugin に渡す",
      "span",
      pair,
      false,
      {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "架空の前 → 架空の後",
              data: [
                [1, 3],
                [2, 0],
              ],
              barThickness: 12,
            },
          ],
        },
        options: {
          indexAxis: "y",
          scales: { y: { display: false } },
          plugins: direct("span"),
        },
      },
    ],
    [
      "share は先頭の系列を百分率にして部分ごとの系列にする",
      "share",
      [{ name: "架空系列", values: [1, 3] }],
      false,
      {
        type: "bar",
        data: {
          labels: [""],
          datasets: [
            { label: "架空A", data: [25], barThickness: 36 },
            { label: "架空B", data: [75], barThickness: 36 },
          ],
        },
        options: shareOptions,
      },
    ],
    [
      "share は合計が0なら全部0%、負は0として数える",
      "share",
      [{ name: "架空系列", values: [0, -2] }],
      false,
      {
        type: "bar",
        data: {
          labels: [""],
          datasets: [
            { label: "架空A", data: [0], barThickness: 36 },
            { label: "架空B", data: [0], barThickness: 36 },
          ],
        },
        options: shareOptions,
      },
    ],
  ] as const)("%s", (_, chartKind, series, horizontal, config) => {
    expect(JSON.stringify(chartConfigOf(chartOf(chartKind, series, horizontal)))).toBe(
      JSON.stringify(config),
    )
  })

  it.each([
    [3, 320],
    [11, 356],
    [20, 608],
  ])("横棒 %i 本の高さは %i px", (count, height) => {
    const names = Array.from({ length: count }, (_, index) => `架空${String(index)}`)
    const config = chartConfigOf(
      chartOf("bar", [{ name: "架空系列", values: names.map(() => 1) }], true, names),
    )

    expect(JSON.stringify(config)).toBe(
      JSON.stringify({
        type: "bar",
        data: { labels: names, datasets: [{ label: "架空系列", data: names.map(() => 1) }] },
        options: { indexAxis: "y", scales: { y: { ticks: { autoSkip: false } } } },
        tsukumo: { height },
      }),
    )
  })

  it.each([
    ["bar", false],
    ["bar", true],
    ["pie", false],
    ["share", false],
    ["arrow", false],
    ["line", false],
  ] as const)(
    "emphasis は %s（横棒 %s）で labels の何番目かにして plugin へ渡す",
    (chartKind, horizontal) => {
      const effective = chartKind === "bar" || chartKind === "pie" || chartKind === "share"
      const config = chartConfigOf(
        chartOf(
          chartKind,
          [
            { name: "架空1", values: [1, 2, 3] },
            { name: "架空2", values: [1, 2, 3] },
          ],
          horizontal,
          ["架空A", "架空B", "架空C"],
          ["架空B"],
        ),
      )

      expect(JSON.stringify(config).includes('"tsukumo-series":{"emphasis":[1]}')).toBe(effective)
    },
  )

  it("share の tones は labels の順の色の語として plugin へ渡し、bar の tones は渡さない", () => {
    const toned = (chartKind: ChartBlock["chartKind"]): ChartBlock => ({
      ...chartOf(chartKind, [{ name: "架空系列", values: [1, 2, 3] }], false, [
        "架空A",
        "架空B",
        "架空C",
      ]),
      tones: ["none", "info", "ok"],
    })

    expect(JSON.stringify(chartConfigOf(toned("share")))).toContain(
      '"tsukumo-series":{"tones":["none","info","ok"]}',
    )
    expect(JSON.stringify(chartConfigOf(toned("bar")))).not.toContain("tones")
  })

  it("縦棒と share には高さを添えない", () => {
    expect(chartConfigOf(chartOf("bar", one, false))).not.toHaveProperty("tsukumo")
    expect(chartConfigOf(chartOf("share", one, true))).not.toHaveProperty("tsukumo")
  })

  describe("line の基準線と点の注記", () => {
    const reference = { value: 1.5, label: "架空の目標" }
    const marked: ChartBlock = {
      ...chartOf("line", two, false),
      references: [reference],
      annotations: [
        { label: "架空系列2", index: 1, text: "架空の注記" },
        { label: "架空系列3", index: 0, text: "系列名の外れ" },
        { label: "架空系列1", index: 2, text: "位置の外れ" },
      ],
    }
    const marks = {
      "tsukumo-chart-marks": {
        references: [reference],
        annotations: [{ series: 1, index: 1, text: "架空の注記" }],
      },
    }

    it("系列名を datasets の位置に直して plugin に渡し、名指しの外れた注記は落とす", () => {
      expect(chartConfigOf(marked).options).toEqual({ plugins: marks })
    })

    it("plot 由来の値の印と並べて渡す", () => {
      expect(chartConfigOf(marked, { values: true }).options).toEqual({
        plugins: { "tsukumo-direct-label": { mode: "values", names: [] }, ...marks },
      })
    })

    it("基準線も注記も無ければ何も足さない", () => {
      expect(chartConfigOf(chartOf("line", one, false)).options).toEqual({})
    })
  })
})
