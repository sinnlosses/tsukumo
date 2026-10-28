import { describe, expect, it } from "vitest"

import { buildReportCatalogDocument } from "../../../src/shared/report/a2ui-report-catalog.ts"
import { REPORT_BLOCK_KINDS } from "../../../src/shared/report/report-block.ts"

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
  image: "Picture",
  plot: "Plot",
  markdown: "Markdown",
} as const

const BASIC_COMPONENTS = ["Row", "Column", "Card", "Tabs", "ChoicePicker"]

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
    const writerKinds = REPORT_BLOCK_KINDS.filter(
      (kind) => kind !== "files" && kind !== "row" && kind !== "panel",
    )

    expect(Object.keys(KIND_TO_COMPONENT).toSorted()).toEqual(writerKinds.toSorted())
  })

  it("根・節・葉 19 種・基本 5 部品の 26 部品が全部残る", () => {
    expect(expected).toHaveLength(26)
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

  it("元の zod の説明が部品の props に運ばれる", () => {
    expect(JSON.stringify(document.components.Claims)).toContain("howToVerify")
  })

  it("葉の部品は id と component を持ち、kind を持たない", () => {
    const leaf = JSON.stringify(document.components.Table)

    expect(leaf).toContain('"id"')
    expect(leaf).not.toContain('"kind"')
  })

  it("Report の workPlanClosing は WORK_PLAN_CLOSINGS と一致する", async () => {
    const { WORK_PLAN_CLOSINGS } = await import("../../../src/shared/session/work-plan.ts")
    const report = JSON.stringify(document.components.Report)

    for (const closing of WORK_PLAN_CLOSINGS) {
      expect(report).toContain(`"${closing}"`)
    }
  })
})
