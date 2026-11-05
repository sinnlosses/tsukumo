import { describe, expect, it } from "vitest"

import { a2uiReportInput } from "../../../../../src/server/report/core/body/a2ui-report-message.ts"
import { parseLegacySections } from "../../../../../src/server/report/core/body/legacy-report-section-list.ts"
import { reportEvents } from "../../../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { parseReportFigure } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import { parseReportRetrospective } from "../../../../../src/shared/report/report-retrospective.ts"
import type { SessionEvent } from "../../../../../src/shared/session/session-event.ts"
import { checkedToolUseId } from "../../../../fixture/tool-use-id.ts"

type ReportCalled = Extract<SessionEvent, { readonly kind: "report" }>

const paragraph = (id: string, text: string) => ({ id, component: "Paragraph", text })

const TABLE = {
  id: "tbl",
  component: "Table",
  title: "架空の表",
  columns: ["項目", "数"],
  rows: [["架空", "1"]],
}

// 正しい一覧。節 2 つ（1 つ目は `Row` の中に `Card`）、図と振り返りの根拠が内容部品を参照する。
const COMPONENTS = [
  {
    id: "root",
    component: "Report",
    conclusion: ["架空の結論。"],
    figure: "fig",
    retrospective: { summary: "架空の振り返り。", blocks: ["retro"] },
    favor: "架空のお願い",
    closing: { text: "架空の締め", expression: "default" },
    sessionRemaining: "架空の残り",
    children: ["sec-1", "sec-2"],
  },
  { id: "sec-1", component: "Section", heading: "架空の節", children: ["row", "p-1"] },
  { id: "row", component: "Row", children: ["card", "tbl"] },
  { id: "card", component: "Card", child: "p-2" },
  paragraph("p-1", "架空の一つ目。"),
  paragraph("p-2", "架空の二つ目。"),
  TABLE,
  { id: "sec-2", component: "Section", heading: "架空の節2", children: ["p-3"] },
  paragraph("p-3", "架空の三つ目。"),
  { id: "fig", component: "Graph", direction: "LR", source: "架空のA -> 架空のB: 渡す" },
  paragraph("retro", "架空の根拠。"),
]

describe("a2uiReportInput の見比べの部品", () => {
  const root = {
    id: "root",
    component: "Report",
    conclusion: ["架空の結論。"],
    figure: "fig",
    children: ["sec"],
  }
  const beforeAfter = {
    title: "架空の前後",
    before: { kind: "image", path: "架空/前.png" },
    after: { kind: "code", language: "ts", source: "const a = 1\n" },
  }

  it("BeforeAfter は節でも図でも Compare の before-after に写り、側の見出しは空になる", () => {
    const { components, droppedCount } = a2uiReportInput([
      root,
      { id: "sec", component: "Section", heading: "", children: ["ba"] },
      { id: "ba", component: "BeforeAfter", ...beforeAfter },
      { id: "fig", component: "BeforeAfter", ...beforeAfter },
    ])
    const expected = {
      component: "Compare",
      title: "架空の前後",
      relation: "before-after",
      sides: [
        { heading: "", kind: "image", path: "架空/前.png" },
        { heading: "", kind: "code", language: "ts", source: "const a = 1\n" },
      ],
      fold: "",
      aside: "",
    }

    expect(droppedCount).toBe(0)
    expect(components.find((part) => part.id === "ba")).toEqual({ id: "ba", ...expected })
    expect(components.find((part) => part.id === "fig")).toEqual({ id: "fig", ...expected })
  })

  it("Compare は relation を省くと versus、kind の無い旧い側は points として受ける", () => {
    const { components, droppedCount } = a2uiReportInput([
      root,
      { id: "sec", component: "Section", heading: "", children: ["fig"] },
      {
        id: "fig",
        component: "Compare",
        title: "架空の見比べ",
        sides: [
          { heading: "架空の案A", points: ["架空の1行"] },
          { heading: "架空の案B", kind: "image", path: "架空/b.png" },
        ],
      },
    ])

    expect(droppedCount).toBe(0)
    expect(components.find((part) => part.id === "fig")).toMatchObject({
      relation: "versus",
      sides: [
        { heading: "架空の案A", kind: "points", points: ["架空の1行"] },
        { heading: "架空の案B", kind: "image", path: "架空/b.png" },
      ],
    })
  })

  it("旧い引数の beforeAfter の塊も Compare の before-after に写る", () => {
    const [event] = reportEvents(
      checkedToolUseId("toolu_1"),
      {
        conclusion: "架空の結論。",
        sections: [{ heading: "", blocks: [{ kind: "beforeAfter", ...beforeAfter }] }],
      },
      [],
    )

    expect(event?.kind === "report" ? event.components.map((part) => part.component) : []).toEqual([
      "Report",
      "Section",
      "Compare",
    ])
    expect(event?.kind === "report" ? event.components[2] : undefined).toMatchObject({
      relation: "before-after",
    })
  })
})

describe("a2uiReportInput", () => {
  it("Report の props を最上位の欄に、Section を節に、配置の部品の中の内容部品を節へ並び順に写す", () => {
    const { input, droppedCount } = a2uiReportInput(COMPONENTS)

    expect(droppedCount).toBe(0)
    expect(input).toMatchObject({
      conclusion: ["架空の結論。"],
      favor: "架空のお願い",
      sessionRemaining: "架空の残り",
      figure: { kind: "graph", source: "架空のA -> 架空のB: 渡す" },
      retrospective: {
        summary: "架空の振り返り。",
        blocks: [{ kind: "text", text: "架空の根拠。" }],
      },
      sections: [
        {
          heading: "架空の節",
          blocks: [
            { kind: "text", text: "架空の二つ目。" },
            { kind: "table", title: "架空の表" },
            { kind: "text", text: "架空の一つ目。" },
          ],
        },
        { heading: "架空の節2", blocks: [{ kind: "text", text: "架空の三つ目。" }] },
      ],
    })
    expect(input).not.toHaveProperty("children")
  })

  it("図の ID が無く figureNone があれば、理由つきの none に写す", () => {
    const [root, ...rest] = COMPONENTS
    const { input } = a2uiReportInput([
      { ...root, figure: undefined, figureNone: "short-answer" },
      ...rest.filter((part) => part.id !== "fig"),
    ])

    expect(input.figure).toEqual({ kind: "none", reason: "short-answer" })
  })

  it("部品の形に合わない要素は落として数える", () => {
    const { components, droppedCount } = a2uiReportInput([
      ...COMPONENTS,
      { id: "x", component: "Banner" },
    ])

    expect(droppedCount).toBe(1)
    expect(components).toHaveLength(COMPONENTS.length)
  })

  it("入れ子の Section と根の子の内容部品も、落とさずに節へ写す", () => {
    const { input } = a2uiReportInput([
      { id: "root", component: "Report", conclusion: ["架空。"], children: ["s", "lone"] },
      { id: "s", component: "Section", heading: "架空の節", children: ["inner", "missing"] },
      { id: "inner", component: "Section", heading: "架空の内側", children: ["p"] },
      paragraph("p", "架空の内側の文。"),
      paragraph("lone", "架空の根の子。"),
    ])

    expect(input.sections).toMatchObject([
      { heading: "架空の節", blocks: [{ kind: "text", text: "架空の内側の文。" }] },
      { blocks: [{ kind: "text", text: "架空の根の子。" }] },
    ])
  })

  it("Quote は塊 quote に text と source を写す", () => {
    const { input } = a2uiReportInput([
      { id: "root", component: "Report", conclusion: ["架空。"], children: ["s"] },
      { id: "s", component: "Section", heading: "架空の節", children: ["q"] },
      { id: "q", component: "Quote", text: "架空の一文", source: "架空の出典" },
    ])

    expect(input.sections).toMatchObject([
      { blocks: [{ kind: "quote", text: "架空の一文", source: "架空の出典" }] },
    ])
  })

  it("DescriptionList は塊 descriptionList に items を写す", () => {
    const { input } = a2uiReportInput([
      { id: "root", component: "Report", conclusion: ["架空。"], children: ["s"] },
      { id: "s", component: "Section", heading: "架空の節", children: ["d"] },
      {
        id: "d",
        component: "DescriptionList",
        items: [{ term: "架空の名前", description: "架空の値" }],
      },
    ])

    expect(input.sections).toMatchObject([
      {
        blocks: [
          {
            kind: "descriptionList",
            items: [{ term: "架空の名前", description: "架空の値" }],
          },
        ],
      },
    ])
  })

  it("Trace は塊 trace に items を写し、省いた補足と出力は空文字で埋める", () => {
    const { input } = a2uiReportInput([
      { id: "root", component: "Report", conclusion: ["架空。"], children: ["s"] },
      { id: "s", component: "Section", heading: "架空の節", children: ["r"] },
      {
        id: "r",
        component: "Trace",
        items: [{ title: "架空の手", status: "ng", output: "架空の出力" }],
      },
    ])

    expect(input.sections).toMatchObject([
      {
        blocks: [
          {
            kind: "trace",
            items: [{ title: "架空の手", status: "ng", supplement: "", output: "架空の出力" }],
          },
        ],
      },
    ])
  })
})

describe("写しの自己テスト", () => {
  it("入力の内容部品は全部、組み直した引数の節・図・振り返りの根拠に残る", () => {
    const { input } = a2uiReportInput(COMPONENTS)

    expect(missingLeafKinds(COMPONENTS, outputKindsOf(input))).toEqual([])
  })

  it("出力から塊を 1 つ落とすと、落とした内容部品を欠けとして拾う", () => {
    const { input } = a2uiReportInput(COMPONENTS)
    const [first, ...rest] = parseLegacySections(input.sections).sections
    const dropped = [
      ...(first === undefined
        ? []
        : [{ ...first, blocks: first.blocks.filter((_, index) => index !== 1) }]),
      ...rest,
    ]

    expect(missingLeafKinds(COMPONENTS, outputKindsOf({ ...input, sections: dropped }))).toEqual([
      "table",
    ])
  })
})

describe("reportEvents の a2ui の版", () => {
  it("受けた一覧が components に入り、欄ごとの字数は組み直した引数で数える", () => {
    const report = reportOf(COMPONENTS)

    expect(report.components).toHaveLength(COMPONENTS.length)
    expect(report.conclusion).toBe("架空の結論。")
    expect(report.favor).toBe("架空のお願い")
    expect(report.closing).toMatchObject({ text: "架空の締め" })
    expect(Object.keys(report.argumentChars.fields)).toEqual(
      expect.arrayContaining(["conclusion", "sections", "figure", "favor"]),
    )
    expect(report.argumentChars.total).toBe(JSON.stringify({ components: COMPONENTS }).length)
  })

  it("components が空の配列なら旧い版の引数として読む", () => {
    const [report] = reportEvents(
      checkedToolUseId("toolu_a2ui"),
      { conclusion: ["架空の結論。"], components: [] },
      ["default"],
    )

    expect(report).toMatchObject({ kind: "report", conclusion: "架空の結論。", components: [] })
  })
})

function reportOf(components: readonly unknown[]): ReportCalled {
  const report = reportEvents(checkedToolUseId("toolu_a2ui"), { components }, ["default"]).find(
    (event): event is ReportCalled => event.kind === "report",
  )
  if (report === undefined) {
    throw new Error("report にならなかった")
  }
  return report
}

/** 組み直した引数の節・図・振り返りの部品の kind。 */
function outputKindsOf(fields: Readonly<Record<string, unknown>>): readonly string[] {
  const figure = parseReportFigure(fields.figure)
  const retrospective = parseReportRetrospective(fields.retrospective)
  return [
    ...parseLegacySections(fields.sections).sections.flatMap((section) =>
      section.blocks.map((block) => block.kind),
    ),
    ...(figure.kind === "none" ? [] : [figure.kind]),
    ...(retrospective.kind === "none" ? [] : retrospective.blocks.map((block) => block.kind)),
  ]
}

/** 入力の `root` から参照を辿って集めた内容部品の kind のうち、出力の塊に無いもの（数で突き合わせる）。 */
function missingLeafKinds(
  components: readonly unknown[],
  output: readonly string[],
): readonly string[] {
  const input = leafKindsOfInput(components)
  const remaining = [...output]
  return input.filter((kind) => {
    const found = remaining.indexOf(kind)
    if (found === -1) {
      return true
    }
    remaining.splice(found, 1)
    return false
  })
}

const LEAF_KIND_OF: Readonly<Record<string, string>> = {
  Paragraph: "text",
  Table: "table",
  Graph: "graph",
}

function leafKindsOfInput(components: readonly unknown[]): readonly string[] {
  const byId = new Map(
    components.flatMap((part) =>
      typeof part === "object" && part !== null && "id" in part && typeof part.id === "string"
        ? [[part.id, part] as const]
        : [],
    ),
  )
  const walk = (id: unknown): readonly string[] => {
    const part = typeof id === "string" ? byId.get(id) : undefined
    if (part === undefined || !("component" in part) || typeof part.component !== "string") {
      return []
    }
    const kind = LEAF_KIND_OF[part.component]
    if (kind !== undefined) {
      return [kind]
    }
    const childIds = [
      ...("children" in part && Array.isArray(part.children) ? part.children : []),
      ...("child" in part ? [part.child] : []),
      ...("figure" in part ? [part.figure] : []),
      ...("retrospective" in part &&
      typeof part.retrospective === "object" &&
      part.retrospective !== null &&
      "blocks" in part.retrospective &&
      Array.isArray(part.retrospective.blocks)
        ? part.retrospective.blocks
        : []),
    ]
    return childIds.flatMap(walk)
  }
  return walk("root")
}
