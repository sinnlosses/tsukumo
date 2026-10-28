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
