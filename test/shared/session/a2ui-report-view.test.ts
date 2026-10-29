import { describe, expect, it } from "vitest"

import { reportHeadedSections } from "../../../src/browser/domain/main-view/main-view-report-body.ts"
import { reportEvents } from "../../../src/server/session-driver/core/sdk-report-message.ts"
import { reportFigureOf } from "../../../src/shared/report/report-outline.ts"
import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../src/shared/session/main-view-shape.ts"
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
    expect([event.components.length, event.droppedCount]).toEqual([PARTS.length, 0])
  })

  it("見出しのある節の ID と見出しは components から導き、components が無ければ面も節も無い", () => {
    const withComponents = regionsOf(event)
    const withoutComponents = regionsOf({ ...event, components: [] })

    expect(withComponents.a2ui.kind).toBe("surface")
    expect(reportHeadedSections(withComponents)).toEqual([
      { id: 1, heading: "架空の表" },
      { id: 2, heading: "架空の並び" },
    ])
    expect(withoutComponents.a2ui.kind).toBe("none")
    expect(reportHeadedSections(withoutComponents)).toEqual([])
  })

  it("markdownLeaves は Markdown の葉だけを持ち、傍注と畳みを包んだ Markdown を当てる", () => {
    const reported = reportOf({ components: MARKDOWN_PARTS })
    const { a2ui } = regionsOf(reported)
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")

    expect(Object.keys(a2ui.markdownLeaves).toSorted()).toEqual(["m1", "m2"])
    expect(a2ui.markdownLeaves.m1).toBe("> 架空の引用")
    expect(a2ui.markdownLeaves.m2).toContain("架空の畳み")
    expect(a2ui.markdownLeaves.m2).toContain("架空の傍注")
  })

  it("整形で落ちた Markdown の葉は空文字で、ほかの葉は持たない", () => {
    const reported = reportOf({
      components: MARKDOWN_PARTS.map((part) =>
        part.id === "m1" ? { ...part, markdown: "以上です" } : part,
      ),
    })
    const { a2ui } = regionsOf(reported)
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")

    expect(a2ui.markdownLeaves.m1).toBe("")
    expect("p1" in a2ui.markdownLeaves).toBe(false)
  })

  it("塊の残らない節は欄を持たず、図があると欄の ID は 1 から振る", () => {
    const { a2ui } = regionsOf(event)
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")

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

  it("figure と retrospective は塊の並びを持ち、葉に由来しない塊は Markdown、欄が無ければ none", () => {
    const parts = [
      {
        id: "root",
        component: "Report",
        conclusion: ["架空の結論。"],
        figure: "fig",
        children: ["p1"],
        retrospective: { summary: "架空の要約。", drafts: [], blocks: ["rt"] },
      },
      { id: "fig", component: "Mermaid", title: "", source: "flowchart TD\n  A --> B" },
      { id: "p1", component: "Paragraph", text: "架空の段落。" },
      { id: "rt", component: "Markdown", markdown: "> 架空の引用" },
    ]
    const { a2ui } = regionsOf(reportOf({ components: parts }))
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")

    expect(a2ui.figure).toEqual({
      kind: "leaves",
      regionId: 0,
      heading: "",
      headingText: "",
      entries: [{ kind: "leaf", id: "fig" }],
    })
    expect(a2ui.retrospective).toMatchObject({
      kind: "leaves",
      heading: "## 振り返り",
      headingText: "振り返り",
      entries: [
        { kind: "text", markdown: "架空の要約。" },
        { kind: "leaf", id: "rt" },
      ],
    })
    expect(a2ui.markdownLeaves.rt).toBe("> 架空の引用")

    const plain = regionsOf(reportOf({ components: PARTS.filter((part) => part.id !== "fig") }))
    expect(plain.a2ui.kind === "surface" ? plain.a2ui.figure : undefined).toEqual({ kind: "none" })
  })

  it("図が無ければ欄の ID は 0 から振る", () => {
    const parts = PARTS.map((part) =>
      part.id === "root" ? { ...part, figure: undefined, figureNone: "short-answer" } : part,
    )
    const withoutFigure = reportOf({ components: parts })
    const { a2ui } = regionsOf(withoutFigure)
    expect(reportFigureOf(withoutFigure.components)).toEqual({
      kind: "none",
      reason: "short-answer",
    })
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")

    expect(a2ui.sections.s1?.regionId).toBe(0)
  })

  it("葉の無い Section があっても、その節を飛ばして面ができる", () => {
    const parts = [
      { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s0", "s1"] },
      { id: "s0", component: "Section", heading: "葉の無い節", children: ["gone"] },
      { id: "s1", component: "Section", heading: "架空の節", children: ["p1"] },
      { id: "p1", component: "Paragraph", text: "架空の段落。" },
    ]
    const { a2ui } = regionsOf(reportOf({ components: parts }))
    if (a2ui.kind !== "surface") throw new Error("面の値が無い")

    expect(a2ui.sections).toEqual({ s1: { regionId: 0, heading: "## 架空の節" } })
  })

  it("根が Report でなければ none", () => {
    const parts = PARTS.filter((part) => part.id !== "root")

    expect(regionsOf(reportOf({ components: parts })).a2ui).toMatchObject({
      kind: "none",
      head: { keyFigures: [], checks: { kind: "none" } },
      favor: { id: "favor-toolu_fictional" },
    })
  })
})

const MARKDOWN_PARTS = [
  { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
  { id: "s1", component: "Section", heading: "架空の節", children: ["p1", "m1", "m2"] },
  { id: "p1", component: "Paragraph", text: "架空の段落。" },
  { id: "m1", component: "Markdown", markdown: "> 架空の引用" },
  {
    id: "m2",
    component: "Markdown",
    markdown: "架空の本文。",
    fold: "架空の畳み",
    aside: "架空の傍注",
  },
]

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
