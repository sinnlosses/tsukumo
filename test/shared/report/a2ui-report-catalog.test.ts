import { keys } from "remeda"
import { describe, expect, it } from "vitest"

import { BASIC_PART_SCHEMAS, BASIC_PARTS } from "../../../src/shared/report/a2ui-basic-part-list.ts"
import {
  buildReportCatalogDocument,
  FIGURE_COMPONENTS,
  LEAF_COMPONENT_KINDS,
  REPORT_BLOCK_KINDS,
  REPORT_COMPONENT_SCHEMAS,
} from "../../../src/shared/report/a2ui-report-catalog.ts"
import { namedWriterBlockSchema } from "../../../src/shared/report/report-block.ts"

// 書き手に渡す塊の kind と部品名の対応（塊を足したら、ここと実装の表の両方に足す）
const KIND_TO_COMPONENT = {
  text: "Paragraph",
  list: "ItemList",
  table: "Table",
  matrix: "Matrix",
  compare: "Compare",
  beforeAfter: "BeforeAfter",
  note: "Note",
  stats: "Stats",
  code: "Code",
  mermaid: "Mermaid",
  graph: "Graph",
  chart: "Chart",
  svg: "Svg",
  timeline: "Timeline",
  options: "Options",
  claims: "Claims",
  quote: "Quote",
  descriptionList: "DescriptionList",
  trace: "Trace",
  image: "Picture",
  plot: "Plot",
  markdown: "Markdown",
} as const

const BASIC_COMPONENTS = ["Row", "Column", "Card", "Tabs", "Divider", "ChoicePicker"]

type Document = ReturnType<typeof buildReportCatalogDocument>

/** 部品の JSON Schema を再帰で歩き、`component` の const を集める。 */
function collectComponentNames(document: { components: object }): readonly string[] {
  return Object.values(document.components).flatMap((schema) => constsOfComponent(schema))
}

function constsOfComponent(node: unknown): readonly string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => constsOfComponent(item))
  }
  if (typeof node === "object" && node !== null) {
    return Object.entries(node).flatMap(([key, value]) => {
      if (key === "component" && typeof value === "object" && value !== null && "const" in value) {
        return typeof value.const === "string" ? [value.const] : []
      }
      return constsOfComponent(value)
    })
  }
  return []
}

function collectRefs(node: unknown): readonly string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectRefs(item))
  }
  if (typeof node === "object" && node !== null) {
    return Object.entries(node).flatMap(([key, value]) =>
      key === "$ref" && typeof value === "string" ? [value] : collectRefs(value),
    )
  }
  return []
}

function findMissingComponents(
  document: { components: object },
  expected: readonly string[],
): readonly string[] {
  const present = new Set(collectComponentNames(document))
  return expected.filter((name) => !present.has(name))
}

function withoutComponent(document: Document, name: string): { components: object } {
  return {
    components: Object.fromEntries(
      Object.entries(document.components).filter(([key]) => key !== name),
    ),
  }
}

describe("A2UI のカタログ文書", () => {
  const document = buildReportCatalogDocument()
  const expected = ["Report", "Section", ...Object.values(KIND_TO_COMPONENT), ...BASIC_COMPONENTS]

  it("書き手に渡す塊の全種類が部品の対応表にある", () => {
    expect(Object.keys(KIND_TO_COMPONENT).toSorted()).toEqual([...REPORT_BLOCK_KINDS].toSorted())
  })

  it("根・節・葉 22 種・基本 6 部品の 30 部品が全部残る", () => {
    expect(expected).toHaveLength(30)
    expect(findMissingComponents(document, expected)).toEqual([])
  })

  it("部品を 1 つ落とした文書は、落とした部品を欠けとして拾う", () => {
    expect(findMissingComponents(withoutComponent(document, "Table"), expected)).toEqual(["Table"])
  })

  it("参照は文書の $defs か common_types.json だけを指す", () => {
    const refs = collectRefs(document.components)

    const dangling = refs.filter((ref) =>
      ref.startsWith("#/$defs/")
        ? !(ref.slice("#/$defs/".length) in document.$defs)
        : !ref.startsWith("common_types.json#/$defs/"),
    )

    expect(refs.length).toBeGreaterThan(0)
    expect(dangling).toEqual([])
  })

  it("内容部品は、元の部品ぜんたいに掛かる検査（refine・superRefine）を落とさない", () => {
    const sources = new Map(
      namedWriterBlockSchema.options.map((option) => [option.shape.kind.value, option]),
    )

    const parts = new Map(Object.entries(REPORT_COMPONENT_SCHEMAS))

    for (const [component, kind] of Object.entries(LEAF_COMPONENT_KINDS)) {
      expect(parts.get(component)?.def.checks?.length ?? 0, component).toBe(
        sources.get(kind)?.def.checks?.length ?? 0,
      )
    }
  })

  it("Plot は Q の列に文字があると落ち、数なら通る", () => {
    const plot = (values: readonly (string | number)[]) => ({
      id: "p",
      component: "Plot",
      question: "架空の工程のどれを縮めるか",
      data: [
        { name: "工程", type: "N", values: ["甲", "乙"] },
        { name: "分", type: "Q", values },
      ],
      relation: "rank",
    })

    expect(REPORT_COMPONENT_SCHEMAS.Plot.safeParse(plot(["多い", 3])).success).toBe(false)
    expect(REPORT_COMPONENT_SCHEMAS.Plot.safeParse(plot([5, 3])).success).toBe(true)
  })

  it("Table は sortable・filterable・filterColumn を任意で受け、使わない呼び出しも通る", () => {
    const base = {
      id: "t",
      component: "Table",
      title: "件数",
      columns: ["名前", "数"],
      rows: [["a", "1"]],
    }
    const schema = REPORT_COMPONENT_SCHEMAS.Table

    expect(schema.safeParse(base).success).toBe(true)
    expect(
      schema.safeParse({ ...base, sortable: true, filterable: true, filterColumn: 0 }).success,
    ).toBe(true)
    expect(schema.safeParse({ ...base, filterColumn: -1 }).success).toBe(false)
    expect(JSON.stringify(document.components.Table)).toContain("filterColumn")
  })

  it("Table は emphasisColumn を任意の 0 以上の整数で受ける", () => {
    const base = {
      id: "t",
      component: "Table",
      title: "件数",
      columns: ["名前", "数"],
      rows: [["a", "1"]],
    }
    const schema = REPORT_COMPONENT_SCHEMAS.Table

    expect(schema.safeParse(base).success).toBe(true)
    expect(schema.safeParse({ ...base, emphasisColumn: 0 }).success).toBe(true)
    expect(schema.safeParse({ ...base, emphasisColumn: -1 }).success).toBe(false)
    expect(schema.safeParse({ ...base, emphasisColumn: 1.5 }).success).toBe(false)
    expect(JSON.stringify(document.components.Table)).toContain("emphasisColumn")
  })

  it("元の zod の説明が部品の props に運ばれる", () => {
    expect(JSON.stringify(document.components.Claims)).toContain("howToVerify")
  })

  it("内容部品は id と component を持ち、kind を持たない", () => {
    const leaf = JSON.stringify(document.components.Table)

    expect(leaf).toContain('"id"')
    expect(leaf).not.toContain('"kind"')
  })

  it("受理の形の表は文書と同じ 30 部品を持つ", () => {
    expect(Object.keys(REPORT_COMPONENT_SCHEMAS).toSorted()).toEqual(expected.toSorted())
  })

  it("Trace は題と状態の 1 行で通り、items が空・status が語彙の外・title が無ければ拒み、supplement・output・fold・aside を受ける", () => {
    const trace = REPORT_COMPONENT_SCHEMAS.Trace
    const item = { title: "架空の手", status: "ok" }
    const parsed = (items: readonly object[], extra: object = {}) =>
      trace.safeParse({ id: "r", component: "Trace", items, ...extra }).success

    expect(parsed([item])).toBe(true)
    expect(parsed([])).toBe(false)
    expect(parsed([{ ...item, status: "warn" }])).toBe(false)
    expect(parsed([{ status: "ng" }])).toBe(false)
    expect(
      parsed([{ ...item, status: "notStarted", supplement: "架空.ts:1", output: "架空の出力" }], {
        fold: "",
        aside: "",
      }),
    ).toBe(true)
  })

  it("DescriptionList は 1 対で通り、items が空か term が無ければ拒み、fold・aside を受ける", () => {
    const list = REPORT_COMPONENT_SCHEMAS.DescriptionList
    const item = { term: "架空の名前", description: "架空の値" }

    expect(list.safeParse({ id: "d", component: "DescriptionList", items: [item] }).success).toBe(
      true,
    )
    expect(list.safeParse({ id: "d", component: "DescriptionList", items: [] }).success).toBe(false)
    expect(
      list.safeParse({ id: "d", component: "DescriptionList", items: [{ description: "値" }] })
        .success,
    ).toBe(false)
    expect(
      list.safeParse({
        id: "d",
        component: "DescriptionList",
        items: [item],
        fold: "",
        aside: "",
      }).success,
    ).toBe(true)
  })

  it("Quote は text だけで通り、text が無ければ拒み、source・fold・aside を受ける", () => {
    const quote = REPORT_COMPONENT_SCHEMAS.Quote

    expect(quote.safeParse({ id: "q", component: "Quote", text: "架空の一文" }).success).toBe(true)
    expect(quote.safeParse({ id: "q", component: "Quote" }).success).toBe(false)
    expect(
      quote.safeParse({
        id: "q",
        component: "Quote",
        text: "架空の一文",
        source: "架空の出典",
        fold: "",
        aside: "",
      }).success,
    ).toBe(true)
  })

  it("Divider は axis だけを受け、axis の不正な値は拒む", () => {
    const divider = REPORT_COMPONENT_SCHEMAS.Divider

    expect(divider.safeParse({ id: "d", component: "Divider" }).success).toBe(true)
    expect(divider.safeParse({ id: "d", component: "Divider", axis: "vertical" }).success).toBe(
      true,
    )
    expect(divider.safeParse({ id: "d", component: "Divider", axis: "diagonal" }).success).toBe(
      false,
    )
  })

  it("内容部品名は対応表の kind に写る", () => {
    expect(LEAF_COMPONENT_KINDS).toEqual(
      Object.fromEntries(
        Object.entries(KIND_TO_COMPONENT).map(([kind, component]) => [component, kind]),
      ),
    )
  })

  it("図に置ける葉は figure の塊の種類と同じ", () => {
    expect(FIGURE_COMPONENTS.toSorted()).toEqual(
      [
        "Picture",
        "Mermaid",
        "Graph",
        "Svg",
        "Timeline",
        "BeforeAfter",
        "Compare",
        "Chart",
        "Stats",
        "Plot",
      ].toSorted(),
    )
  })

  it.each(keys(BASIC_PART_SCHEMAS))(
    "基本の %s の受理の形は、公開物の写しと欄の名前・必須の欄が揃う",
    (name) => {
      const part = BASIC_PARTS[name].allOf[2]
      const schema = BASIC_PART_SCHEMAS[name]
      const required = Object.entries(schema.shape)
        .filter(([, field]) => !field.safeParse(undefined).success)
        .map(([key]) => key)

      expect(Object.keys(schema.shape).toSorted()).toEqual(
        [...Object.keys(part.properties), "id", "weight"].toSorted(),
      )
      expect(required.toSorted()).toEqual([...part.required, "id"].toSorted())
    },
  )

  it("Report の workPlanClosing は WORK_PLAN_CLOSINGS と一致する", async () => {
    const { WORK_PLAN_CLOSINGS } = await import("../../../src/shared/session/work-plan.ts")
    const report = JSON.stringify(document.components.Report)

    for (const closing of WORK_PLAN_CLOSINGS) {
      expect(report).toContain(`"${closing}"`)
    }
  })
})
