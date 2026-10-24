import { describe, expect, it } from "vitest"

import {
  GRAPH_SHAPE_LEGEND,
  captionRow,
  chartFenceOf,
  fencedFigureCaptioned,
  graphMarkdown,
  markdownOf,
} from "../../fixture/report-markdown.ts"

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

  it("graph は ID を n0 から振り直し、ラベルを引用符で包んだ flowchart にして図の番号と題を付ける", () => {
    expect(
      graphMarkdown('@a (b) "c" `d` -> (架空の丸)\n架空の丸 -> {架空の分岐}: a|b', "架空の図"),
    ).toBe(
      fencedFigureCaptioned(
        [
          "```mermaid",
          "flowchart LR",
          '  n0["@a (b) #quot;c#quot; #96;d#96;"]',
          '  n1(["架空の丸"])',
          '  n2{"架空の分岐"}',
          "  n0 --> n1",
          '  n1 -->|"a|b"| n2',
          "```",
          "",
          GRAPH_SHAPE_LEGEND,
        ].join("\n"),
        "架空の図",
      ),
    )
  })

  it("graph の節点の説明はラベルの2行目に小さい字で置き、HTML に読まれる記号は実体にする", () => {
    const markdown = graphMarkdown("甲 | 説明 <b> & 続き\n甲 -> 乙\n甲 -> 丙")

    expect(markdown).toContain('  n0["甲<br/><small>説明 #lt;b#gt; #amp; 続き</small>"]')
    expect(markdown).toContain('  n1["乙"]')
  })

  it("graph の囲みを subgraph にして、群の外の節点を先に宣言し、群ごとに破線の枠の style を足す", () => {
    const markdown = graphMarkdown("A -> B\n[架空の群]\nB -> C\n[]\nD")

    expect(markdown).toContain(
      [
        "flowchart LR",
        '  n0["A"]',
        '  n3["D"]',
        '  subgraph g0["架空の群"]',
        '    n1["B"]',
        '    n2["C"]',
        "  end",
        "  n0 --> n1",
        "  n1 --> n2",
        "  style g0 fill:var(--surface-raised),stroke:var(--rule-quiet),stroke-width:1px,stroke-dasharray:5 4",
        "```",
      ].join("\n"),
    )
    expect(markdown).not.toContain("graph-legend")
  })

  it.each([
    ["箱だけ", "A -> B\nA -> C", []],
    ["箱と角丸", "(A) -> B\nB -> C\nB -> D", ["round", "box"]],
    ["群があっても形が1種", "[群]\nA -> B\n[]", []],
    ["3種", "(A) -> B\nB -> {C}", ["round", "box", "decision"]],
  ])(
    "graph の形の凡例は形が2種以上のときだけ、出た形を出す順で並べる（%s）",
    (_, source, shapes) => {
      expect(
        [...graphMarkdown(source).matchAll(/graph-legend-shape-(\w+)"/g)].map((match) => match[1]),
      ).toEqual(shapes)
    },
  )

  it("graph の形の凡例は印の凡例と同じ行に、形を先に並べる", () => {
    const markdown = graphMarkdown("(A) -> B\n+ B -> C\nB -> D")

    expect(markdown.match(/<div class="graph-legend">/g)).toHaveLength(1)
    expect(markdown.indexOf("graph-legend-shape-round")).toBeLessThan(
      markdown.indexOf("graph-legend-added"),
    )
  })

  it("graph の印を classDef / class / linkStyle にし、凡例は印のある図にだけ付ける", () => {
    const marked = graphMarkdown("+ A -> B\n- B -> C: 語\n~ D\n- E\nB -> D")

    expect(marked).toContain(
      [
        "  classDef added stroke:var(--state-ok),stroke-width:3px",
        "  classDef removed stroke:var(--state-ng),stroke-width:3px,stroke-dasharray:5 4",
        "  classDef changed stroke:var(--state-warn),stroke-width:3px",
        "  class n3 changed",
        "  class n4 removed",
        "  linkStyle 0 stroke:var(--state-ok),stroke-width:2px",
        "  linkStyle 1 stroke:var(--state-ng),stroke-width:2px,stroke-dasharray:5 4",
        "```",
      ].join("\n"),
    )
    expect(marked).toContain('<div class="graph-legend">')
    expect(marked).toContain("足した")
    expect(marked).toContain("消した")
    expect(marked).toContain("変えた")

    const plain = graphMarkdown("A -> B")
    expect(plain).not.toContain("classDef")
    expect(plain).not.toContain("linkStyle")
    expect(plain).not.toContain("graph-legend")
  })

  it("graph の色の目印を系列色の classDef / style / linkStyle にし、点線の辺を破線にして、凡例を図の下に並べる", () => {
    const toned = graphMarkdown(
      "[層] @a\nA @b\nB -.> C @c\n[]\nD -> E: 語 @b\nE -.> D\n+ F @a\nF -> A",
      "",
      [
        { tone: "a", label: "甲" },
        { tone: "b", label: "乙" },
      ],
    )

    expect(toned).toContain(
      "  style g0 fill:var(--surface-raised),stroke:var(--chart-series-1),stroke-width:2px",
    )
    expect(toned).toContain("  classDef tone-b stroke:var(--chart-series-2),stroke-width:3px")
    expect(toned).not.toContain("classDef tone-a")
    expect(toned).toContain("  class n0 tone-b")
    expect(toned).toContain("  class n5 added")
    expect(toned).toContain(
      [
        "  linkStyle 0 stroke:var(--chart-series-3),stroke-width:2px,stroke-dasharray:5 4",
        "  linkStyle 1 stroke:var(--chart-series-2),stroke-width:2px",
        "  linkStyle 2 stroke-dasharray:5 4",
      ].join("\n"),
    )
    expect(toned).toContain('class="graph-legend-swatch graph-legend-tone-a"')
    expect(toned).toContain("乙")
    expect(toned.indexOf("graph-legend-tone-a")).toBeLessThan(toned.indexOf("graph-legend-tone-b"))
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

    expect(markdown).toContain('<svg viewBox="0 0 200 100" width="200" height="100">')
    expect(markdown).toContain(
      '<rect x="10" y="20" width="80" height="40" rx="4" stroke-width="3"></rect>',
    )
    expect(markdown).toContain('<rect x="100" y="20" width="80" height="40" rx="4"></rect>')
    expect(markdown).toContain('marker-end="url(#report-svg-arrow)"')
    expect(markdown).toContain("A&lt;b&gt;</text>")
    expect(markdown).toContain('<text x="5" y="90" font-size="14">架空の字</text>')
    expect(markdown).not.toContain("\n\n<svg")
    expect(markdown).toContain(captionRow("図", 1, "架空の配置"))
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

    expect(markdown).toContain(
      '<text x="50" y="40" font-size="14" text-anchor="middle" dominant-baseline="middle">題</text>',
    )
    expect(markdown).toContain('<text x="122" y="42" font-size="14">題</text>')
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

    expect(markdown).toContain(
      '<text x="50" y="32" font-size="14" text-anchor="middle" dominant-baseline="middle">題</text>',
    )
    expect(markdown).toContain(
      '<text x="50" y="50" font-size="12" text-anchor="middle" dominant-baseline="middle" data-sub>説明</text>',
    )
    expect(markdown).toContain('<text x="122" y="42" font-size="14">題</text>')
    expect(markdown).toContain('<text x="122" y="58" font-size="12" data-sub>説明</text>')
    expect(markdown).not.toContain("出ない説明")
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

    expect(markdown).toContain(
      '<rect x="10" y="20" width="80" height="40" rx="4" data-tone="a"></rect>',
    )
    expect(markdown).toContain('<div class="svg-legend">')
    expect(markdown).toContain('<rect data-tone="b" x="1" y="1" width="14" height="10" rx="2">')
    expect(markdown).toContain("層&lt;A&gt;</span>")
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

    expect(markdown).toContain(
      '<line x1="0" y1="0" x2="50" y2="0" marker-end="url(#report-svg-arrow)" data-tone="b"></line>',
    )
    expect(markdown).toContain(
      '<line x1="0" y1="10" x2="50" y2="10" marker-end="url(#report-svg-arrow)" stroke-dasharray="6 4"></line>',
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

      expect(fence).toContain(`"tsukumo":{"height":${String(height)}}`)
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
        expect(
          chartFenceOf({
            kind: "chart",
            title: "",
            chartKind,
            labels,
            series: one,
            horizontal,
            emphasis: [],
            fold: "",
            aside: "",
          }),
        ).not.toContain('"tsukumo":')
      }
    })
  })
})
