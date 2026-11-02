import { describe, expect, it } from "vitest"

import { a2uiStructureFaults } from "../../../../../src/server/report/core/rules/structure.ts"

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

const filterTable = (extra: object = {}) => ({
  id: "t",
  component: "Table",
  columns: ["名前", "種別"],
  rows: [
    ["a", { status: "ok", text: "良" }],
    ["b", { tag: "新" }],
  ],
  filterable: true,
  ...extra,
})

const picker = (path: string, values: readonly string[]) => ({
  id: "c",
  component: "ChoicePicker",
  options: values.map((value) => ({ label: value, value })),
  value: { path },
})

const filterList = (table: object, choice: object) => [
  report(["s"]),
  section("s", ["t", "c"]),
  table,
  choice,
]

describe("a2uiStructureFaults の絞り込みの結び", () => {
  it("実在する filterable な Table のセルにある値を選ぶ ChoicePicker は通る", () => {
    const components = filterList(filterTable(), picker("/view/t/filter", ["a", "良", "新"]))

    expect(a2uiStructureFaults(components)).toEqual([])
  })

  it.each([
    {
      name: "path の Table が無い",
      components: filterList(filterTable(), picker("/view/nothing/filter", ["a"])),
      faults: [{ kind: "filter-target-missing", pointer: "/components/3/value/path" }],
    },
    {
      name: "Table が filterable でない",
      components: filterList(filterTable({ filterable: false }), picker("/view/t/filter", ["a"])),
      faults: [{ kind: "filter-target-not-filterable", pointer: "/components/3/value/path" }],
    },
    {
      name: "選択肢の値が絞り込む列のセルに無い",
      components: filterList(
        filterTable({ filterColumn: 0 }),
        picker("/view/t/filter", ["a", "良"]),
      ),
      faults: [{ kind: "filter-option-not-in-cells", pointer: "/components/3/options/1/value" }],
    },
  ])("$name を拾う", ({ components, faults }) => {
    expect(a2uiStructureFaults(components)).toEqual(faults)
  })
})

describe("a2uiStructureFaults の Divider", () => {
  const divider = { id: "d", component: "Divider" }

  it.each([
    {
      name: "Section の子",
      components: [report(["s"]), section("s", ["p", "d"]), paragraph("p"), divider],
      faults: [],
    },
    {
      name: "Row の子",
      components: [
        report(["s"]),
        section("s", ["r"]),
        { id: "r", component: "Row", children: ["p", "d"] },
        paragraph("p"),
        divider,
      ],
      faults: [],
    },
    {
      name: "Report の子",
      components: [report(["d"]), divider],
      faults: [{ kind: "report-child-not-section", pointer: "/components/0/children/0" }],
    },
  ])("$name に置いたときの違反", ({ components, faults }) => {
    expect(a2uiStructureFaults(components)).toEqual(faults)
  })
})

describe("a2uiStructureFaults の DescriptionList", () => {
  const list = {
    id: "d",
    component: "DescriptionList",
    items: [{ term: "架空の名前", description: "架空の値" }],
  }

  it.each([
    {
      name: "Section の子",
      components: [report(["s"]), section("s", ["d"]), list],
      faults: [],
    },
    {
      name: "Report.figure",
      components: [report(["s"], { figure: "d" }), section("s", ["p"]), paragraph("p"), list],
      faults: [{ kind: "figure-not-figure-part", pointer: "/components/0/figure" }],
    },
  ])("$name に置いたときの違反", ({ components, faults }) => {
    expect(a2uiStructureFaults(components)).toEqual(faults)
  })
})

describe("a2uiStructureFaults の Trace", () => {
  const trace = {
    id: "r",
    component: "Trace",
    items: [{ title: "架空の手", status: "ok" }],
  }

  it.each([
    {
      name: "Section の子",
      components: [report(["s"]), section("s", ["r"]), trace],
      faults: [],
    },
    {
      name: "Report.figure",
      components: [report(["s"], { figure: "r" }), section("s", ["p"]), paragraph("p"), trace],
      faults: [{ kind: "figure-not-figure-part", pointer: "/components/0/figure" }],
    },
  ])("$name に置いたときの違反", ({ components, faults }) => {
    expect(a2uiStructureFaults(components)).toEqual(faults)
  })
})

describe("a2uiStructureFaults の Quote", () => {
  const quote = { id: "q", component: "Quote", text: "架空の一文" }

  it.each([
    {
      name: "Section の子",
      components: [report(["s"]), section("s", ["q"]), quote],
      faults: [],
    },
    {
      name: "Report.figure",
      components: [report(["s"], { figure: "q" }), section("s", ["p"]), paragraph("p"), quote],
      faults: [{ kind: "figure-not-figure-part", pointer: "/components/0/figure" }],
    },
  ])("$name に置いたときの違反", ({ components, faults }) => {
    expect(a2uiStructureFaults(components)).toEqual(faults)
  })
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
      name: "配置の部品の入れ子が 3 階層（題つきの枠を横に並べる形）",
      components: [
        report(["s"]),
        section("s", ["r1"]),
        { id: "r1", component: "Row", children: ["r2"] },
        { id: "r2", component: "Card", child: "r3" },
        { id: "r3", component: "Column", children: ["p"] },
        paragraph("p"),
      ],
      faults: [],
    },
    {
      name: "配置の部品の入れ子が 4 階層",
      components: [
        report(["s"]),
        section("s", ["r1"]),
        { id: "r1", component: "Row", children: ["r2"] },
        { id: "r2", component: "Column", children: ["r3"] },
        { id: "r3", component: "Card", child: "r4" },
        { id: "r4", component: "Row", children: ["p"] },
        paragraph("p"),
      ],
      faults: [{ kind: "deep-layout", pointer: "/components/4/child" }],
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

describe("a2uiStructureFaults の寄せ先の無い memo", () => {
  const note = (id: string, tone: string) => ({ id, component: "Note", tone, text: "架空の注記。" })

  it.each([
    {
      name: "節の子が memo の Note 1つだけ",
      components: [report(["s"]), section("s", ["n"]), note("n", "memo")],
      faults: [{ kind: "memo-without-owner", pointer: "/components/1/children/0" }],
    },
    {
      name: "節の先頭が memo の Note で後ろに Paragraph が続く",
      components: [report(["s"]), section("s", ["n", "p"]), note("n", "memo"), paragraph("p")],
      faults: [{ kind: "memo-without-owner", pointer: "/components/1/children/0" }],
    },
    {
      name: "配置の部品の先頭にある memo の Note が節の最初の葉",
      components: [
        report(["s"]),
        section("s", ["r", "p"]),
        { id: "r", component: "Row", children: ["n"] },
        note("n", "memo"),
        paragraph("p"),
      ],
      faults: [{ kind: "memo-without-owner", pointer: "/components/2/children/0" }],
    },
  ])("$name を拾う", ({ components, faults }) => {
    expect(a2uiStructureFaults(components)).toEqual(faults)
  })

  it.each([
    {
      name: "Paragraph の後ろの memo の Note",
      components: [report(["s"]), section("s", ["p", "n"]), paragraph("p"), note("n", "memo")],
    },
    {
      name: "先頭の memo 以外の Note",
      components: [report(["s"]), section("s", ["n"]), note("n", "info")],
    },
    {
      name: "前の節に葉があっても、自分の節の2番目以降にある memo",
      components: [
        report(["s1", "s2"]),
        section("s1", ["p"]),
        section("s2", ["q", "n"]),
        paragraph("p"),
        paragraph("q"),
        note("n", "memo"),
      ],
    },
  ])("$name は通る", ({ components }) => {
    expect(a2uiStructureFaults(components)).toEqual([])
  })
})
