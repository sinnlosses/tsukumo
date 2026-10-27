import { describe, expect, it } from "vitest"

import {
  GRAPH_SHAPE_LEGEND,
  fencedFigureCaptioned,
  graphMarkdown,
} from "../../fixture/report-markdown.ts"

function legend(...items: readonly (readonly [string, string])[]): string {
  return (
    '<div class="graph-legend">' +
    items
      .map(
        ([swatch, label]) =>
          `<span class="graph-legend-item"><span class="graph-legend-swatch graph-legend-${swatch}" aria-hidden="true"></span>${label}</span>`,
      )
      .join("") +
    "</div>"
  )
}

describe("graph の塊の mermaid のソースと凡例", () => {
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

    expect(markdown).toBe(
      fencedFigureCaptioned(
        [
          "```mermaid",
          "flowchart LR",
          '  n0["甲<br/><small>説明 #lt;b#gt; #amp; 続き</small>"]',
          '  n1["乙"]',
          '  n2["丙"]',
          "  n0 --> n1",
          "  n0 --> n2",
          "```",
        ].join("\n"),
      ),
    )
  })

  it("graph の囲みを subgraph にして、群の外の節点を先に宣言し、群ごとに地の色の style を足す", () => {
    const markdown = graphMarkdown("A -> B\n[架空の群]\nB -> C\n[]\nD")

    expect(markdown).toBe(
      fencedFigureCaptioned(
        [
          "```mermaid",
          "flowchart LR",
          '  n0["A"]',
          '  n3["D"]',
          '  subgraph g0["架空の群"]',
          '    n1["B"]',
          '    n2["C"]',
          "  end",
          "  n0 --> n1",
          "  n1 --> n2",
          "  style g0 fill:var(--graph-ground-1),stroke:var(--rule-quiet),stroke-width:1px",
          "```",
        ].join("\n"),
      ),
    )
  })

  it("入れ子の囲みは外側の subgraph の中に内側の subgraph を出し、直の節点は内側のあとに置く", () => {
    const markdown = graphMarkdown("[外]\n[内]\nA\n[]\nB\n[]\nA -> B")

    expect(markdown).toContain(
      [
        '  subgraph g1["外"]',
        '    subgraph g0["内"]',
        '      n0["A"]',
        "    end",
        '    n1["B"]',
        "  end",
      ].join("\n"),
    )
  })

  it("箱の説明の改行は <br/> でつなぎ、行ごとに実体へ直す", () => {
    const markdown = graphMarkdown("甲 | 一行目\\n二行目&\\n三行目")

    expect(markdown).toContain('n0["甲<br/><small>一行目<br/>二行目#amp;<br/>三行目</small>"]')
  })

  it("色の目印の無い群に地の色を順に当て、3つで巡る。目印のある群は数えない", () => {
    const markdown = graphMarkdown(
      "[甲]\nA\n[]\n[乙] @a\nB\n[]\n[丙]\nC\n[]\n[丁]\nD\n[]\n[戊]\nE\n[]",
    )

    expect(
      [...markdown.matchAll(/style g(\d) fill:var\(--graph-ground-(\d)\)/g)].map(
        ([, group, ground]) => [group, ground],
      ),
    ).toEqual([
      ["0", "1"],
      ["2", "2"],
      ["3", "3"],
      ["4", "1"],
    ])
  })

  it("graph の戻り道を戻り道の色の破線にし、凡例に「戻り道」を足す。変更の印は戻り道より先に効く", () => {
    const markdown = graphMarkdown("A -> B\nA <- B: 呼び直す\n+ B <- C")

    expect(markdown).toBe(
      fencedFigureCaptioned(
        [
          "```mermaid",
          "flowchart LR",
          '  n0["A"]',
          '  n1["B"]',
          '  n2["C"]',
          "  n0 --> n1",
          '  n1 -->|"呼び直す"| n0',
          "  n2 --> n1",
          "  classDef added stroke:var(--state-ok),stroke-width:3px",
          "  linkStyle 1 stroke:var(--graph-return),stroke-width:2px,stroke-dasharray:5 4",
          "  linkStyle 2 stroke:var(--state-ok),stroke-width:2px,stroke-dasharray:5 4",
          "```",
          "",
          legend(
            ["added", "足した"],
            ["removed", "消した"],
            ["changed", "変えた"],
            ["return", "戻り道"],
          ),
        ].join("\n"),
      ),
    )
    expect(graphMarkdown("A -> B\nA -> C").match(/graph-legend-return/g)).toBeNull()
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

    expect(marked).toBe(
      fencedFigureCaptioned(
        [
          "```mermaid",
          "flowchart LR",
          '  n0["A"]',
          '  n1["B"]',
          '  n2["C"]',
          '  n3["D"]',
          '  n4["E"]',
          "  n0 --> n1",
          '  n1 -->|"語"| n2',
          "  n1 --> n3",
          "  classDef added stroke:var(--state-ok),stroke-width:3px",
          "  classDef removed stroke:var(--state-ng),stroke-width:3px,stroke-dasharray:5 4",
          "  classDef changed stroke:var(--state-warn),stroke-width:3px",
          "  class n3 changed",
          "  class n4 removed",
          "  linkStyle 0 stroke:var(--state-ok),stroke-width:2px",
          "  linkStyle 1 stroke:var(--state-ng),stroke-width:2px,stroke-dasharray:5 4",
          "```",
          "",
          legend(["added", "足した"], ["removed", "消した"], ["changed", "変えた"]),
        ].join("\n"),
      ),
    )
    expect(graphMarkdown("A -> B\nA -> C")).toBe(
      fencedFigureCaptioned(
        [
          "```mermaid",
          "flowchart LR",
          '  n0["A"]',
          '  n1["B"]',
          '  n2["C"]',
          "  n0 --> n1",
          "  n0 --> n2",
          "```",
        ].join("\n"),
      ),
    )
  })

  it("graph の色の目印を系列色の classDef（地は薄い塗り）/ style / linkStyle にし、点線の辺を破線にして、凡例を図の下に並べる", () => {
    const toned = graphMarkdown(
      "[層] @a\nA @b\nB -.> C @c\n[]\nD -> E: 語 @b\nE -.> D\n+ F @a\nF -> A",
      "",
      [
        { tone: "a", label: "甲" },
        { tone: "b", label: "乙" },
      ],
    )

    expect(toned).toBe(
      fencedFigureCaptioned(
        [
          "```mermaid",
          "flowchart LR",
          '  n3["D"]',
          '  n4["E"]',
          '  n5["F"]',
          '  subgraph g0["層"]',
          '    n0["A"]',
          '    n1["B"]',
          '    n2["C"]',
          "  end",
          "  n1 --> n2",
          '  n3 -->|"語"| n4',
          "  n4 --> n3",
          "  n5 --> n0",
          "  style g0 fill:var(--surface-raised),stroke:var(--chart-series-1),stroke-width:2px",
          "  classDef added stroke:var(--state-ok),stroke-width:3px",
          "  classDef tone-b fill:var(--graph-tone-fill-b),stroke:var(--chart-series-2),stroke-width:3px",
          "  class n0 tone-b",
          "  class n5 added",
          "  linkStyle 0 stroke:var(--chart-series-3),stroke-width:2px,stroke-dasharray:5 4",
          "  linkStyle 1 stroke:var(--chart-series-2),stroke-width:2px",
          "  linkStyle 2 stroke-dasharray:5 4",
          "```",
          "",
          legend(
            ["added", "足した"],
            ["removed", "消した"],
            ["changed", "変えた"],
            ["tone-a", "甲"],
            ["tone-b", "乙"],
          ),
        ].join("\n"),
      ),
    )
  })
})
