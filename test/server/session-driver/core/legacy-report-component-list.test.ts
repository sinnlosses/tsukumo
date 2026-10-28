import { describe, expect, it } from "vitest"

import { a2uiStructureFaults } from "../../../../src/server/report/core/a2ui-structure-fault.ts"
import { legacyReportComponents } from "../../../../src/server/session-driver/core/legacy-report-component-list.ts"
import {
  a2uiReportComponentSchema,
  LEAF_COMPONENT_KINDS,
} from "../../../../src/shared/report/a2ui-report-catalog.ts"

const text = (value: string): unknown => ({ kind: "text", text: value })

const LEAVES: Readonly<Record<string, unknown>> = {
  text: text("架空の地の文"),
  list: { kind: "list", style: "bullet", items: [{ text: "架空の項目" }] },
  table: { kind: "table", title: "架空の表", columns: ["甲", "乙"], rows: [["1", "2"]] },
  matrix: {
    kind: "matrix",
    title: "架空の対応",
    columns: ["列A", "列B"],
    rows: [{ name: "行1", cells: ["ok", "na"] }],
  },
  compare: {
    kind: "compare",
    title: "",
    sides: [
      { heading: "案A", points: ["架空"] },
      { heading: "案B", points: ["架空"] },
    ],
  },
  beforeAfter: {
    kind: "beforeAfter",
    title: "架空の前後",
    before: { kind: "points", points: ["架空の1行"] },
    after: { kind: "image", path: "架空/after.png" },
  },
  note: { kind: "note", tone: "info", text: "架空の注記" },
  stats: {
    kind: "stats",
    items: [
      { label: "甲", value: "1" },
      { label: "乙", value: "2" },
      { label: "丙", value: "3" },
    ],
  },
  code: { kind: "code", language: "ts", source: "const a = 1" },
  mermaid: { kind: "mermaid", source: "graph TD; A-->B" },
  graph: { kind: "graph", direction: "LR", source: "架空のA -> 架空のB: 渡す" },
  chart: {
    kind: "chart",
    chartKind: "bar",
    labels: ["架空の一"],
    series: [{ name: "架空の系列", values: [1] }],
  },
  svg: {
    kind: "svg",
    width: 200,
    height: 100,
    shapes: [{ kind: "text", x: 5, y: 5, text: "架空の字" }],
  },
  timeline: {
    kind: "timeline",
    title: "架空の経過",
    rows: [{ name: "甲", lane: "", start: 0, end: 3, extra: [] }],
  },
  options: {
    kind: "options",
    title: "架空の比較",
    items: [
      { name: "架空", verdict: "adopt", reason: "架空の理由。" },
      { name: "架空2", verdict: "reject", reason: "架空の理由。" },
    ],
  },
  claims: {
    kind: "claims",
    items: [{ certainty: "confirmed", claim: "架空", basis: "", howToVerify: "" }],
  },
  quote: { kind: "quote", text: "架空の引用" },
  image: { kind: "image", path: "/架空/a.png", caption: "架空" },
  plot: {
    kind: "plot",
    question: "架空の問い",
    data: [{ name: "架空の量", type: "Q", values: [1, 2, 3] }],
    relation: "compare",
  },
  markdown: { kind: "markdown", markdown: "架空の本文" },
}

const kindsOf = (components: readonly Readonly<Record<string, unknown>>[]): readonly unknown[] =>
  components.map((part) => part.component)

describe("legacyReportComponents", () => {
  it("構造の規約に外れず、全部の部品がカタログに受理される", () => {
    const result = legacyReportComponents({
      conclusion: "架空の結論。",
      sections: [{ heading: "架空の節", blocks: [text("甲"), text("乙")] }],
    })

    expect(result).toBeDefined()
    const components = result?.components ?? []
    expect(a2uiStructureFaults(components)).toEqual([])
    expect(components.every((part) => a2uiReportComponentSchema.safeParse(part).success)).toBe(true)
    expect(components[0]).toMatchObject({
      id: "root",
      component: "Report",
      conclusion: ["架空の結論。"],
      children: ["section-1"],
    })
  })

  it("葉の塊は同名の部品に写り、fold と aside も残る", () => {
    const entries = Object.entries(LEAVES)
    expect(entries.map(([kind]) => kind).toSorted()).toEqual(
      Object.values(LEAF_COMPONENT_KINDS).toSorted(),
    )
    const result = legacyReportComponents({
      sections: [
        { heading: "", blocks: [{ kind: "text", text: "甲", fold: "畳み", aside: "傍注" }] },
      ],
    })
    expect(result?.components[2]).toMatchObject({
      component: "Paragraph",
      text: "甲",
      fold: "畳み",
      aside: "傍注",
    })

    const leafResult = legacyReportComponents({
      sections: [{ heading: "", blocks: entries.map(([, block]) => block) }],
    })
    const leafComponents = (leafResult?.components ?? []).slice(2)
    expect(leafComponents.map((part) => part.component)).toEqual(
      Object.entries(LEAF_COMPONENT_KINDS)
        .filter(([, kind]) => kind in LEAVES)
        .map(([component]) => component),
    )
    expect(leafResult?.unknownBlockCount).toBe(0)
  })

  it("row は Row、panel は Card と Column に写り、題は先頭の Paragraph になる", () => {
    const result = legacyReportComponents({
      sections: [
        {
          heading: "架空の節",
          blocks: [
            { kind: "row", blocks: [text("甲"), text("乙")] },
            { kind: "panel", title: "架空の枠", blocks: [text("丙")] },
          ],
        },
      ],
    })
    const components = result?.components ?? []

    expect(a2uiStructureFaults(components)).toEqual([])
    expect(kindsOf(components)).toEqual([
      "Report",
      "Section",
      "Row",
      "Paragraph",
      "Paragraph",
      "Card",
      "Column",
      "Paragraph",
      "Paragraph",
    ])
    expect(components.find((part) => part.component === "Column")).toMatchObject({
      children: ["section-1-2-title", "section-1-2-1"],
    })
    expect(components.find((part) => part.id === "section-1-2-title")).toMatchObject({
      text: "架空の枠",
    })
  })

  it("figure は Report.figure に、図なしの理由は figureNone に写る", () => {
    const figure = legacyReportComponents({
      figure: LEAVES.graph,
      sections: [{ heading: "", blocks: [text("甲")] }],
    })
    expect(figure?.components[0]).toMatchObject({ figure: "figure" })
    expect(figure?.components.find((part) => part.id === "figure")).toMatchObject({
      component: "Graph",
    })
    expect(a2uiStructureFaults(figure?.components ?? [])).toEqual([])

    const none = legacyReportComponents({
      figure: { kind: "none", reason: "short-answer" },
      sections: [{ heading: "", blocks: [text("甲")] }],
    })
    expect(none?.components[0]).toMatchObject({ figureNone: "short-answer" })
  })

  it("振り返りの塊は Report.retrospective.blocks が指す部品になる", () => {
    const result = legacyReportComponents({
      retrospective: { summary: "架空の結果", blocks: [LEAVES.code] },
      sections: [{ heading: "", blocks: [text("甲")] }],
    })
    const components = result?.components ?? []

    expect(components[0]).toMatchObject({
      retrospective: { summary: "架空の結果", blocks: ["retrospective-1"] },
    })
    expect(components.find((part) => part.id === "retrospective-1")).toMatchObject({
      component: "Code",
    })
    expect(a2uiStructureFaults(components)).toEqual([])
  })

  it("body は今の読みで塊にして写り、散文は Markdown の部品になる", () => {
    const result = legacyReportComponents({
      body: "架空の散文\n\n```table 架空の表\n| 甲 | 乙 |\n| - | - |\n| 1 | 2 |\n```\n\n```code\n壊れた\n```",
    })
    const components = result?.components ?? []

    expect(kindsOf(components).slice(1)).toEqual(["Section", "Markdown", "Table", "Code"])
    expect(result?.brokenFenceCount).toBe(1)
    expect(a2uiStructureFaults(components)).toEqual([])
  })

  it("知らない種類の塊は失って数え、節が残らなければ undefined", () => {
    expect(
      legacyReportComponents({ sections: [{ heading: "", blocks: [{ kind: "unknown" }] }] }),
    ).toBeUndefined()
    expect(legacyReportComponents({ body: "  " })).toBeUndefined()
    const result = legacyReportComponents({
      sections: [{ heading: "", blocks: [text("甲"), { kind: "unknown" }] }],
    })
    expect(result?.unknownBlockCount).toBe(1)
  })

  it("conclusion が文字列でも配列でもなければ undefined", () => {
    expect(
      legacyReportComponents({
        conclusion: 3,
        sections: [{ heading: "", blocks: [text("甲")] }],
      }),
    ).toBeUndefined()
  })
})
