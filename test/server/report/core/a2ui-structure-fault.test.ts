import { describe, expect, it } from "vitest"

import { a2uiStructureFaults } from "../../../../src/server/report/core/a2ui-structure-fault.ts"

// 正しい一覧。節 2 つ、`Row` の中に `Card`、図と振り返りの根拠が葉を参照する。
const VALID = [
  {
    id: "root",
    component: "Report",
    conclusion: ["架空の結論。"],
    figure: "fig",
    retrospective: { kind: "none", blocks: ["retro"] },
    children: ["sec-1", "sec-2"],
  },
  { id: "sec-1", component: "Section", heading: "架空の節", children: ["row", "p-1"] },
  { id: "row", component: "Row", children: ["card", "p-2"] },
  { id: "card", component: "Card", child: "p-3" },
  { id: "p-1", component: "Paragraph", text: "架空の文。" },
  { id: "p-2", component: "Paragraph", text: "架空の文。" },
  { id: "p-3", component: "Paragraph", text: "架空の文。" },
  { id: "sec-2", component: "Section", heading: "架空の節2", children: ["tabs"] },
  { id: "tabs", component: "Tabs", tabs: [{ title: "架空の題", child: "p-4" }] },
  { id: "p-4", component: "Paragraph", text: "架空の文。" },
  { id: "fig", component: "Graph", source: "A -> B" },
  { id: "retro", component: "Table", columns: ["a"], rows: [["1"]] },
] as const

const paragraph = (id: string) => ({ id, component: "Paragraph", text: "架空の文。" })

const report = (children: readonly string[], extra: object = {}) => ({
  id: "root",
  component: "Report",
  conclusion: ["架空の結論。"],
  children,
  ...extra,
})

const section = (id: string, children: readonly string[]) => ({
  id,
  component: "Section",
  heading: "架空の節",
  children,
})

describe("a2uiStructureFaults", () => {
  it("正しい一覧は違反を返さない", () => {
    expect(a2uiStructureFaults(VALID)).toEqual([])
  })

  it.each([
    {
      name: "未知の部品",
      components: [report(["s"]), section("s", ["x"]), { id: "x", component: "Banner" }],
      faults: [{ kind: "unknown-component", pointer: "/components/2/component" }],
    },
    {
      name: "Report の子が葉",
      components: [report(["p"]), paragraph("p")],
      faults: [{ kind: "report-child-not-section", pointer: "/components/0/children/0" }],
    },
    {
      name: "Section の入れ子",
      components: [report(["s"]), section("s", ["inner"]), section("inner", ["p"]), paragraph("p")],
      faults: [{ kind: "nested-section", pointer: "/components/1/children/0" }],
    },
    {
      name: "Section の入れ子（3 つ目の部品の子）",
      components: [report(["s"]), paragraph("p"), section("s", ["inner"]), section("inner", ["p"])],
      faults: [{ kind: "nested-section", pointer: "/components/2/children/0" }],
    },
    {
      name: "未定義の ID",
      components: [report(["s"]), section("s", ["p", "missing"]), paragraph("p")],
      faults: [{ kind: "undefined-reference", pointer: "/components/1/children/1" }],
    },
    {
      name: "未参照の部品",
      components: [report(["s"]), section("s", ["p"]), paragraph("p"), paragraph("lonely")],
      faults: [{ kind: "unreferenced-component", pointer: "/components/3" }],
    },
    {
      name: "ID の重複",
      components: [report(["s"]), section("s", ["p"]), paragraph("p"), paragraph("p")],
      faults: [{ kind: "duplicate-id", pointer: "/components/3/id" }],
    },
    {
      name: "根が無い",
      components: [section("s", ["p"]), paragraph("p")],
      faults: [
        { kind: "missing-root", pointer: "/components" },
        { kind: "unreferenced-component", pointer: "/components/0" },
        { kind: "unreferenced-component", pointer: "/components/1" },
      ],
    },
    {
      name: "根が Report でない",
      components: [{ ...section("root", ["p"]) }, paragraph("p")],
      faults: [
        { kind: "root-not-report", pointer: "/components/0/component" },
        { kind: "unreferenced-component", pointer: "/components/1" },
      ],
    },
    {
      name: "配置の部品の入れ子が 3 階層",
      components: [
        report(["s"]),
        section("s", ["r1"]),
        { id: "r1", component: "Row", children: ["r2"] },
        { id: "r2", component: "Column", children: ["r3"] },
        { id: "r3", component: "Card", child: "p" },
        paragraph("p"),
      ],
      faults: [{ kind: "deep-layout", pointer: "/components/3/children/0" }],
    },
    {
      name: "配置の部品の子に Section",
      components: [
        report(["s"]),
        section("s", ["r"]),
        { id: "r", component: "Row", children: ["inner"] },
        section("inner", ["p"]),
        paragraph("p"),
      ],
      faults: [{ kind: "misplaced-component", pointer: "/components/2/children/0" }],
    },
    {
      name: "図が図の部品でない",
      components: [
        report(["s"], { figure: "p" }),
        section("s", ["q"]),
        paragraph("p"),
        paragraph("q"),
      ],
      faults: [{ kind: "figure-not-figure-part", pointer: "/components/0/figure" }],
    },
  ])("$name を拾う", ({ components, faults }) => {
    expect(a2uiStructureFaults(components)).toEqual(faults)
  })
})
