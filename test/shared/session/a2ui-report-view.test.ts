import { describe, expect, it } from "vitest"

import { reportHeadedSections } from "../../../src/browser/domain/main-view/main-view-report-body.ts"
import { reportEvents } from "../../../src/server/session-driver/core/sdk-report-message.ts"
import type { A2uiReportComponent } from "../../../src/shared/report/a2ui-report-catalog.ts"
import { joinParts } from "../../../src/shared/report/report-inline-markdown.ts"
import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import type {
  MainViewA2uiReport,
  MainViewReportRegions,
} from "../../../src/shared/session/main-view-shape.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"

type ReportEvent = Extract<SessionEvent, { readonly kind: "report" }>

const PARTS = [
  {
    id: "root",
    component: "Report",
    conclusion: ["架空の結論。"],
    figure: "fig",
    children: ["s1", "s2", "s3", "p0"],
  },
  { id: "fig", component: "Mermaid", title: "架空の図", source: "flowchart TD\n  A --> B" },
  { id: "s1", component: "Section", heading: "架空の表", children: ["t1", "m1", "p1"] },
  {
    id: "t1",
    component: "Table",
    title: "架空の表の題",
    columns: ["架空の列", "架空の数"],
    rows: [["架空の値", "1"]],
    aside: "架空の出典",
  },
  { id: "m1", component: "Note", tone: "memo", text: "架空の覚え書き。" },
  { id: "p1", component: "Paragraph", text: "架空の段落。" },
  { id: "s2", component: "Section", heading: "架空の定型", children: ["b1"] },
  { id: "b1", component: "Paragraph", text: "以上です" },
  { id: "s3", component: "Section", heading: "架空の並び", children: ["r1"] },
  { id: "r1", component: "Row", children: ["c1", "p3"] },
  { id: "c1", component: "Card", child: "p2" },
  { id: "p2", component: "Paragraph", text: "架空の左。" },
  { id: "p3", component: "Paragraph", text: "架空の右。" },
  { id: "p0", component: "Paragraph", text: "架空の根の段落。" },
]

describe("a2ui の版の記録の本文", () => {
  const event = reportOf({ components: PARTS })

  it("題材の部品は 1 つも落ちずに記録に写る", () => {
    expect([event.components.length, event.unknownBlockCount]).toEqual([PARTS.length, 0])
  })

  it("components の有無で、見出しのある節の ID と見出しが同じ", () => {
    const withComponents = regionsOf(event)
    const withoutComponents = regionsOf({ ...event, components: [] })

    expect(withComponents.a2ui.kind).toBe("surface")
    expect(withoutComponents.a2ui.kind).toBe("none")
    expect(reportHeadedSections(withComponents)).toEqual(reportHeadedSections(withoutComponents))
  })

  it("一覧の葉は全部 leaves にあり、節ごとに葉を繋ぐとその節の欄の Markdown になる", () => {
    const regions = regionsOf(event)

    expect(leafMismatches(regions, event.components)).toEqual([])
  })

  it("葉を 1 つ leaves から抜くと、上の検査が抜けた葉を拾う", () => {
    const regions = regionsOf(event)
    if (regions.a2ui.kind !== "surface") throw new Error("面の値が無い")
    const { p1: _dropped, ...leaves } = regions.a2ui.leaves

    expect(
      leafMismatches({ ...regions, a2ui: { ...regions.a2ui, leaves } }, event.components),
    ).toContain("p1")
  })

  it("整形で落ちた葉は空文字で、塊の残らない節は欄を持たず、図があると欄の ID は 1 から振る", () => {
    const { a2ui } = regionsOf(event)
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")

    expect(a2ui.leaves.b1).toBe("")
    expect(a2ui.leaves.m1).toBe("")
    expect(a2ui.leaves.t1).toContain("架空の覚え書き。")
    expect(a2ui.sections).toEqual({
      s1: { regionId: 1, heading: "## 架空の表" },
      s3: { regionId: 2, heading: "## 架空の並び" },
      p0: { regionId: 3, heading: "" },
    })
  })

  it("leafValues は図の葉・節の葉・振り返りの葉に、通しの番号と寄せた傍注を持つ", () => {
    const parts = [
      {
        id: "root",
        component: "Report",
        conclusion: ["架空の結論。"],
        figure: "fig",
        children: ["s1"],
        retrospective: { summary: "架空の要約。", drafts: [], blocks: ["rt"] },
      },
      { id: "fig", component: "Mermaid", title: "", source: "flowchart TD\n  A --> B" },
      { id: "s1", component: "Section", heading: "架空の節", children: ["t1", "m1", "b1"] },
      {
        id: "t1",
        component: "Table",
        title: "架空の表",
        columns: ["列", "数"],
        rows: [["値", "1"]],
      },
      { id: "m1", component: "Note", tone: "memo", text: "架空の覚え書き。" },
      { id: "b1", component: "Paragraph", text: "以上です" },
      {
        id: "rt",
        component: "Table",
        title: "架空の根拠",
        columns: ["列", "数"],
        rows: [["値", "1"]],
      },
    ]
    const reported = reportOf({ components: parts })
    const { a2ui } = regionsOf(reported)
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")

    expect(Object.keys(a2ui.leafValues).toSorted()).toEqual(["fig", "m1", "rt", "t1"])
    expect(a2ui.leafValues.fig?.captionNumber).toEqual({ kind: "figure", ordinal: 1 })
    expect(a2ui.leafValues.t1?.captionNumber).toEqual({ kind: "table", ordinal: 1 })
    expect(a2ui.leafValues.t1?.gutterNotes).toEqual([{ label: "メモ", text: "架空の覚え書き。" }])
    expect(a2ui.leafValues.m1?.mergedIntoPrevious).toBe(true)
    expect(a2ui.leafValues.rt?.captionNumber).toEqual({ kind: "table", ordinal: 2 })
    expect(a2ui.imageSource).toEqual({
      kind: "shelved",
      toolUseId: reported.toolUseId,
      sizes: [],
      unshelved: [],
    })
  })

  it("図が無ければ欄の ID は 0 から振る", () => {
    const parts = PARTS.map((part) =>
      part.id === "root" ? { ...part, figure: undefined, figureNone: "short-answer" } : part,
    )
    const withoutFigure = reportOf({ components: parts })
    const { a2ui } = regionsOf(withoutFigure)
    expect(withoutFigure.figure.kind).toBe("none")
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")

    expect(a2ui.sections.s1?.regionId).toBe(0)
  })

  it("節の葉の数が記録の sections と食い違えば none", () => {
    const [first, ...rest] = event.sections
    if (first === undefined) throw new Error("節が無い")
    const broken = { ...event, sections: [{ ...first, blocks: first.blocks.slice(1) }, ...rest] }

    expect(regionsOf(broken).a2ui).toEqual({ kind: "none" })
  })
})

const plainTable = (id: string, extra: Readonly<Record<string, unknown>>) => ({
  id,
  component: "Table",
  title: "架空の表",
  columns: ["名", "種", "数"],
  rows: [
    ["ぼ", "甲", "10"],
    ["あ", "乙", "9"],
    ["ん", "甲", "100"],
  ],
  sortable: true,
  filterable: true,
  ...extra,
})

/** 操作できる表の見え方（行の組み方が変わる種類）。どれも、行を選び直せることを同じ検査で見る。 */
const TABLE_VARIANTS = [
  { name: "素の表", extra: {} },
  {
    name: "状態のセルがあり凡例が付く表",
    extra: {
      rows: [
        ["ぼ", "甲", { status: "ok", text: "完了" }],
        ["あ", "乙", { status: "ng", text: "停止" }],
        ["ん", "甲", "なし"],
      ],
    },
  },
  {
    name: "数の列に棒が付く表",
    extra: {
      columns: ["名", "種", "件数"],
      rows: [
        ["ぼ", "甲", "5"],
        ["あ", "乙", "50"],
      ],
    },
  },
  {
    name: "札のセルがある表",
    extra: {
      rows: [
        ["ぼ", { tag: "甲" }, "1"],
        ["あ", { tag: "乙" }, "2"],
      ],
    },
  },
  {
    name: "変わったセルがある表",
    extra: {
      rows: [
        ["ぼ", { from: "甲", to: "乙" }, "1"],
        ["あ", "丙", "2"],
      ],
    },
  },
  {
    name: "強調の行がある表",
    extra: {
      rows: [{ cells: ["ぼ", "甲", "1"], emphasis: true }, ["あ", "乙", "2"]],
    },
  },
  { name: "rest が付く表", extra: { rest: "ほか 3 件は省略" } },
  { name: "傍注が付く表", extra: { aside: "架空の出典" } },
  { name: "fold で畳む表", extra: { fold: "架空の補足" } },
  { name: "行が 1 つだけの表", extra: { rows: [["ぼ", "甲", "1"]] } },
] as const

describe("操作できる表の行の分け方（tables）", () => {
  const tablesOf = (parts: readonly object[]) => {
    const event = reportOf({ components: parts })
    const { a2ui } = regionsOf(event)
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")
    return a2ui
  }
  const reportWith = <Part extends { readonly id: string }>(
    table: object,
    before: readonly Part[] = [],
  ) => [
    { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
    {
      id: "s1",
      component: "Section",
      heading: "架空の節",
      children: [...before.map((part) => part.id), "t1"],
    },
    ...before,
    table,
  ]

  it.each(TABLE_VARIANTS)(
    "$name: 前後と行を繋ぐと葉の Markdown になり、行の数が表と同じ",
    ({ extra }) => {
      const table = plainTable("t1", extra)
      const view = tablesOf(reportWith(table))
      const split = view.tables.t1

      expect(split?.rows).toHaveLength(table.rows.length)
      expect(`${split?.before}${split?.rows.join("\n")}${split?.after}`).toBe(view.leaves.t1)
    },
  )

  it("先に別の表と札があっても、札の色と表の番号は葉の Markdown どおりに行へ入る", () => {
    const first = plainTable("t0", {
      rows: [
        ["ぼ", { tag: "甲" }, "1"],
        ["あ", { tag: "乙" }, "2"],
      ],
      sortable: undefined,
      filterable: undefined,
    })
    const second = plainTable("t1", {
      rows: [
        ["ぼ", { tag: "乙" }, "1"],
        ["あ", { tag: "丙" }, "2"],
      ],
    })
    const view = tablesOf(reportWith(second, [first]))
    const split = view.tables.t1

    expect(split?.before).toContain("表 2")
    expect(`${split?.before}${split?.rows.join("\n")}${split?.after}`).toBe(view.leaves.t1)
    expect(split?.rows.join("\n")).toContain("tag-2")
  })

  it("操作を使わない表は tables に無い", () => {
    const view = tablesOf(
      reportWith(plainTable("t1", { sortable: undefined, filterable: undefined })),
    )

    expect(view.tables).toEqual({})
  })

  it("整形で落ちた葉の表は tables に無く、残る表の分け方は崩れない", () => {
    const view = tablesOf(
      reportWith(plainTable("t1", {}), [{ id: "b1", component: "Paragraph", text: "以上です" }]),
    )

    expect(view.leaves.b1).toBe("")
    expect(Object.keys(view.tables)).toEqual(["t1"])
  })
})

function reportOf(input: Readonly<Record<string, unknown>>): ReportEvent {
  const [event] = reportEvents("toolu_fictional", input, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  return event
}

function regionsOf(event: ReportEvent): MainViewReportRegions {
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

/**
 * 一覧を根から再帰でたどって集めた葉のうち `leaves` に無いものの ID と、
 * 葉を繋いでも欄の Markdown にならない節の部品の ID。
 */
function leafMismatches(
  regions: MainViewReportRegions,
  components: readonly A2uiReportComponent[],
): readonly string[] {
  const view: MainViewA2uiReport = regions.a2ui
  if (view.kind !== "surface") return ["(none)"]
  const byId = new Map(components.map((part) => [part.id, part]))
  const leavesUnder = (id: string): readonly string[] => {
    const part = byId.get(id)
    if (part === undefined) return []
    switch (part.component) {
      case "Report":
      case "Section":
      case "Row":
      case "Column":
        return part.children.flatMap(leavesUnder)
      case "Card":
        return leavesUnder(part.child)
      case "Tabs":
        return part.tabs.flatMap((tab) => leavesUnder(tab.child))
      case "ChoicePicker":
        return []
      default:
        return [id]
    }
  }
  const missing = leavesUnder("root").filter((id) => !(id in view.leaves))
  const unjoined = Object.entries(view.sections).flatMap(([id, section]) => {
    const markdown = regions.sections.find((region) => region.id === section.regionId)?.markdown
    const joined = joinParts([
      section.heading,
      ...leavesUnder(id).map((leaf) => view.leaves[leaf] ?? ""),
    ])
    return joined === markdown ? [] : [id]
  })
  return [...missing, ...unjoined]
}
