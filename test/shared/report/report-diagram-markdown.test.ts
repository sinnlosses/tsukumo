import { describe, expect, it } from "vitest"

import {
  captionRow,
  chartFenceOf,
  fencedFigureCaptioned,
  markdownOf,
} from "../../fixture/report-markdown.ts"

const SVG_ARROW_DEFS =
  '<defs><marker id="report-svg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z"></path></marker></defs>'

const svgFigure = (
  width: number,
  height: number,
  shapes: string,
  title = "",
  legend = "",
): string =>
  `<div class="captioned captioned-fit"><div class="svg-figure"><svg viewBox="0 0 ${String(width)} ${String(height)}" width="${String(width)}" height="${String(height)}">${SVG_ARROW_DEFS}${shapes}</svg></div>${legend}${captionRow("図", 1, title)}</div>`

const svgLegend = (...items: readonly (readonly [string, string])[]): string =>
  `<div class="svg-legend">${items
    .map(
      ([tone, label]) =>
        `<span class="svg-legend-item"><svg viewBox="0 0 16 12" width="16" height="12"><rect data-tone="${tone}" x="1" y="1" width="14" height="10" rx="2"></rect></svg>${label}</span>`,
    )
    .join("")}</div>`

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

  it("svg は図形から viewBox つきの1行の SVG を組み、強調の枠・矢じり・ラベルの逃がしを含めて図の番号と題を付ける", () => {
    const markdown = markdownOf({
      kind: "svg",
      title: "架空の配置",
      width: 200,
      height: 100,
      fold: "",
      aside: "",
      legend: [],
      shapes: [
        {
          kind: "rect",
          x: 10,
          y: 20,
          width: 80,
          height: 40,
          label: "A<b>",
          sub: "",
          emphasis: true,
          labelAt: "center",
          tone: "none",
        },
        {
          kind: "rect",
          x: 100,
          y: 20,
          width: 80,
          height: 40,
          label: "",
          sub: "",
          emphasis: false,
          labelAt: "center",
          tone: "none",
        },
        {
          kind: "line",
          x1: 90,
          y1: 40,
          x2: 100,
          y2: 40,
          arrow: true,
          label: "",
          dashed: false,
          tone: "none",
        },
        { kind: "text", x: 5, y: 90, text: "架空の字" },
      ],
    })

    expect(markdown).toBe(
      svgFigure(
        200,
        100,
        '<rect x="10" y="20" width="80" height="40" rx="4" stroke-width="3"></rect>' +
          '<text x="50" y="40" font-size="14" text-anchor="middle" dominant-baseline="middle">A&lt;b&gt;</text>' +
          '<rect x="100" y="20" width="80" height="40" rx="4"></rect>' +
          '<line x1="90" y1="40" x2="100" y2="40" marker-end="url(#report-svg-arrow)"></line>' +
          '<text x="5" y="90" font-size="14">架空の字</text>',
        "架空の配置",
      ),
    )
  })

  it("svg の枠の題は center なら枠の中心、top-left なら左上の内側に左寄せで置く", () => {
    const rect = {
      kind: "rect",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      label: "題",
      sub: "",
      emphasis: false,
      tone: "none",
    } as const
    const markdown = markdownOf({
      kind: "svg",
      title: "",
      width: 200,
      height: 100,
      fold: "",
      aside: "",
      legend: [],
      shapes: [
        { ...rect, labelAt: "center" },
        { ...rect, x: 110, labelAt: "top-left" },
      ],
    })

    expect(markdown).toBe(
      svgFigure(
        200,
        100,
        '<rect x="10" y="20" width="80" height="40" rx="4"></rect>' +
          '<text x="50" y="40" font-size="14" text-anchor="middle" dominant-baseline="middle">題</text>' +
          '<rect x="110" y="20" width="80" height="40" rx="4"></rect>' +
          '<text x="122" y="42" font-size="14">題</text>',
      ),
    )
  })

  it("svg の枠の sub は題の下に小さい字で置き、label が空なら描かない", () => {
    const rect = {
      kind: "rect",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      emphasis: false,
      tone: "none",
    } as const
    const markdown = markdownOf({
      kind: "svg",
      title: "",
      width: 200,
      height: 100,
      fold: "",
      aside: "",
      legend: [],
      shapes: [
        { ...rect, label: "題", sub: "説明", labelAt: "center" },
        { ...rect, x: 110, label: "題", sub: "説明", labelAt: "top-left" },
        { ...rect, y: 70, label: "", sub: "出ない説明", labelAt: "center" },
      ],
    })

    expect(markdown).toBe(
      svgFigure(
        200,
        100,
        '<rect x="10" y="20" width="80" height="40" rx="4"></rect>' +
          '<text x="50" y="32" font-size="14" text-anchor="middle" dominant-baseline="middle">題</text>' +
          '<text x="50" y="50" font-size="12" text-anchor="middle" dominant-baseline="middle" data-sub>説明</text>' +
          '<rect x="110" y="20" width="80" height="40" rx="4"></rect>' +
          '<text x="122" y="42" font-size="14">題</text>' +
          '<text x="122" y="58" font-size="12" data-sub>説明</text>' +
          '<rect x="10" y="70" width="80" height="40" rx="4"></rect>',
      ),
    )
  })

  it("svg の rect の tone は data-tone で運び、legend は図の下に tone ごとの見本と名前で並べる", () => {
    const markdown = markdownOf({
      kind: "svg",
      title: "",
      width: 200,
      height: 100,
      fold: "",
      aside: "",
      legend: [
        { tone: "a", label: "層<A>" },
        { tone: "b", label: "層B" },
      ],
      shapes: [
        {
          kind: "rect",
          x: 10,
          y: 20,
          width: 80,
          height: 40,
          label: "",
          sub: "",
          emphasis: false,
          labelAt: "center",
          tone: "a",
        },
      ],
    })

    expect(markdown).toBe(
      svgFigure(
        200,
        100,
        '<rect x="10" y="20" width="80" height="40" rx="4" data-tone="a"></rect>',
        "",
        svgLegend(["a", "層&lt;A&gt;"], ["b", "層B"]),
      ),
    )
  })

  it("svg の line の tone は data-tone、dashed は stroke-dasharray で運ぶ", () => {
    const line = { kind: "line", x1: 0, y1: 0, x2: 50, y2: 0, arrow: true, label: "" } as const
    const markdown = markdownOf({
      kind: "svg",
      title: "",
      width: 100,
      height: 50,
      fold: "",
      aside: "",
      legend: [{ tone: "b", label: "異常" }],
      shapes: [
        { ...line, dashed: false, tone: "b" },
        { ...line, y1: 10, y2: 10, dashed: true, tone: "none" },
      ],
    })

    expect(markdown).toBe(
      svgFigure(
        100,
        50,
        '<line x1="0" y1="0" x2="50" y2="0" marker-end="url(#report-svg-arrow)" data-tone="b"></line>' +
          '<line x1="0" y1="10" x2="50" y2="10" marker-end="url(#report-svg-arrow)" stroke-dasharray="6 4"></line>',
        "",
        svgLegend(["b", "異常"]),
      ),
    )
  })

  it("beforeAfter の svg の側も SVG を組む", () => {
    const side = {
      kind: "svg",
      width: 50,
      height: 50,
      shapes: [{ kind: "text", x: 1, y: 2, text: "架空" }],
      legend: [],
    } as const
    const markdown = markdownOf({
      kind: "beforeAfter",
      title: "",
      before: side,
      after: side,
      fold: "",
      aside: "",
    })

    expect(markdown.match(/<svg viewBox="0 0 50 50"/g)).toHaveLength(2)
  })

  describe("chart の設定", () => {
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
    ] as const)(
      "chart の %s は Chart.js の設定を chart フェンスに JSON で書く",
      (_, chartKind, series, horizontal, config) => {
        expect(
          chartFenceOf({
            kind: "chart",
            title: "",
            chartKind,
            labels,
            series,
            horizontal,
            emphasis: [],
            fold: "",
            aside: "",
          }),
        ).toBe(`\`\`\`chart\n${JSON.stringify(config)}\n\`\`\``)
      },
    )

    it.each([
      [3, 320],
      [11, 356],
      [20, 608],
    ])("横棒 %i 本の高さは %i px", (count, height) => {
      const names = Array.from({ length: count }, (_, index) => `架空${String(index)}`)
      const fence = chartFenceOf({
        kind: "chart",
        title: "",
        chartKind: "bar",
        labels: names,
        series: [{ name: "架空系列", values: names.map(() => 1) }],
        horizontal: true,
        emphasis: [],
        fold: "",
        aside: "",
      })

      expect(fence).toBe(
        `\`\`\`chart\n${JSON.stringify({
          type: "bar",
          data: { labels: names, datasets: [{ label: "架空系列", data: names.map(() => 1) }] },
          options: { indexAxis: "y", scales: { y: { ticks: { autoSkip: false } } } },
          tsukumo: { height },
        })}\n\`\`\``,
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
        const fence = chartFenceOf({
          kind: "chart",
          title: "",
          chartKind,
          labels: ["架空A", "架空B", "架空C"],
          series: [
            { name: "架空1", values: [1, 2, 3] },
            { name: "架空2", values: [1, 2, 3] },
          ],
          horizontal,
          emphasis: ["架空B"],
          fold: "",
          aside: "",
        })

        expect(fence.includes('"tsukumo-series":{"emphasis":[1]}')).toBe(effective)
      },
    )

    it("縦棒と share には高さを添えない", () => {
      for (const [chartKind, horizontal] of [
        ["bar", false],
        ["share", true],
      ] as const) {
        const fence = chartFenceOf({
          kind: "chart",
          title: "",
          chartKind,
          labels,
          series: one,
          horizontal,
          emphasis: [],
          fold: "",
          aside: "",
        })
        expect(JSON.parse(fence.split("\n")[1] ?? "")).not.toHaveProperty("tsukumo")
      }
    })
  })
})
