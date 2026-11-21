import { describe, expect, it } from "vitest"

import {
  a2uiStructureFaultMessage,
  a2uiStructureFaults,
} from "../../../../../src/server/report/core/rules/structure.ts"
import { REPORT_COMPONENT_SCHEMAS } from "../../../../../src/shared/report/a2ui-report-catalog.ts"

// 正しい一覧。節 2 つ、`Grid` の中に `Tabs`、図と振り返りの根拠が内容部品を参照する。
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
  { id: "row", component: "Grid", children: ["card", "p-2"] },
  { id: "card", component: "Tabs", tabs: [{ title: "架空の題", child: "p-3" }] },
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

describe("a2uiStructureFaults の外した基本の部品", () => {
  it.each([
    { name: "Row", part: { id: "x", component: "Row", children: ["p"] } },
    { name: "Column", part: { id: "x", component: "Column", children: ["p"] } },
    { name: "Card", part: { id: "x", component: "Card", child: "p" } },
    { name: "Divider", part: { id: "x", component: "Divider" } },
    {
      name: "ChoicePicker",
      part: {
        id: "x",
        component: "ChoicePicker",
        options: [{ label: "a", value: "a" }],
        value: { path: "/view/t/filter" },
      },
    },
  ])("書き手が $name を書くと知らない部品として差し戻る", ({ part }) => {
    const faults = a2uiStructureFaults([
      report(["s"]),
      section("s", ["p", "x"]),
      paragraph("p"),
      part,
    ])

    expect(faults).toContainEqual({ kind: "unknown-component", pointer: "/components/3/component" })
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
      name: "Report の子が内容部品",
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
        { id: "r1", component: "Grid", children: ["r2"] },
        { id: "r2", component: "Tabs", tabs: [{ title: "架空の題", child: "r3" }] },
        { id: "r3", component: "Grid", children: ["p"] },
        paragraph("p"),
      ],
      faults: [],
    },
    {
      name: "配置の部品の入れ子が 4 階層",
      components: [
        report(["s"]),
        section("s", ["r1"]),
        { id: "r1", component: "Grid", children: ["r2"] },
        { id: "r2", component: "Grid", children: ["r3"] },
        { id: "r3", component: "Tabs", tabs: [{ title: "架空の題", child: "r4" }] },
        { id: "r4", component: "Grid", children: ["p"] },
        paragraph("p"),
      ],
      faults: [{ kind: "deep-layout", pointer: "/components/4/tabs/0/child" }],
    },
    {
      name: "配置の部品の子に Section",
      components: [
        report(["s"]),
        section("s", ["r"]),
        { id: "r", component: "Grid", children: ["inner"] },
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
    {
      name: "図に置いた部品を節にも置く",
      components: [
        report(["s"], { figure: "g" }),
        section("s", ["g"]),
        { id: "g", component: "Graph", source: "A -> B" },
      ],
      faults: [{ kind: "shared-reference", pointer: "/components/0/figure" }],
    },
    {
      name: "同じ部品を2つの節に置く",
      components: [report(["s", "t"]), section("s", ["p"]), section("t", ["p"]), paragraph("p")],
      faults: [{ kind: "shared-reference", pointer: "/components/2/children/0" }],
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
      name: "配置の部品の先頭にある memo の Note が節の最初の内容部品",
      components: [
        report(["s"]),
        section("s", ["r", "p"]),
        { id: "r", component: "Grid", children: ["n"] },
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
      name: "前の節に内容部品があっても、自分の節の2番目以降にある memo",
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

describe("a2uiStructureFaults の favorOptions", () => {
  const option = (name: string, recommended?: boolean) => ({
    name,
    draft: "架空の下書き",
    recommended,
  })
  const withOptions = (options: readonly object[], favor = "架空のお願い。") => [
    report(["s"], { favor, favorOptions: options }),
    section("s", ["p"]),
    paragraph("p"),
  ]

  it("3つ・勧める印1つは通る", () => {
    expect(
      a2uiStructureFaults(withOptions([option("甲", true), option("乙"), option("丙")])),
    ).toEqual([])
  })

  it("勧める印が2つだと favor-options-recommended", () => {
    expect(a2uiStructureFaults(withOptions([option("甲", true), option("乙", true)]))).toEqual([
      { kind: "favor-options-recommended", pointer: "/components/0/favorOptions" },
    ])
  })

  it("favor が無いと favor-options-without-favor", () => {
    expect(a2uiStructureFaults(withOptions([option("甲")], ""))).toEqual([
      { kind: "favor-options-without-favor", pointer: "/components/0/favorOptions" },
    ])
  })

  it("4つは欄の形で拒まれる", () => {
    const four = [option("a"), option("b"), option("c"), option("d")]

    expect(REPORT_COMPONENT_SCHEMAS.Report.safeParse(withOptions(four)[0]).success).toBe(false)
  })
})

describe("a2uiStructureFaults の検証の行の supports", () => {
  const withSupports = (supports?: readonly string[]) => [
    report(["s"], { checks: [{ status: "ok", label: "架空", supports }] }),
    section("s", ["p"]),
    paragraph("p"),
  ]

  it("節を指す・省くときは通る", () => {
    expect(a2uiStructureFaults(withSupports(["s"]))).toEqual([])
    expect(a2uiStructureFaults(withSupports())).toEqual([])
  })

  it("節でない部品を指すと supports-not-section", () => {
    expect(a2uiStructureFaults(withSupports(["p"]))).toEqual([
      { kind: "supports-not-section", pointer: "/components/0/checks/0/supports/0" },
    ])
  })

  it("無い id を指すと supports-undefined で、文が直し方を言う", () => {
    const faults = a2uiStructureFaults(withSupports(["nothing"]))

    expect(faults).toEqual([
      { kind: "supports-undefined", pointer: "/components/0/checks/0/supports/0" },
    ])
    expect(faults.map((fault) => JSON.parse(a2uiStructureFaultMessage(fault)))).toMatchObject([
      { error: { message: expect.stringContaining("Section の id") } },
    ])
  })
})
