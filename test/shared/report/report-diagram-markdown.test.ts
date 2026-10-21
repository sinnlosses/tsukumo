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
    ["箱だけ", "A -> B", []],
    ["箱と角丸", "(A) -> B", ["round", "box"]],
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
    const markdown = graphMarkdown("(A) -> B\n+ B -> C")

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
          emphasis: false,
          labelAt: "center",
          tone: "none",
        },
        { kind: "line", x1: 90, y1: 40, x2: 100, y2: 40, arrow: true, label: "" },
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
        "bar の horizontal は indexAxis を y にする",
        "bar",
        one,
        true,
        {
          type: "bar",
          data: { labels, datasets: [{ label: "架空系列", data: [1, 2] }] },
          options: { indexAxis: "y" },
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
            fold: "",
            aside: "",
          }),
        ).toBe(`\`\`\`chart\n${JSON.stringify(config)}\n\`\`\``)
      },
    )
  })
})
