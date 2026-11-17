import { describe, expect, it } from "vitest"

import {
  type DraftSource,
  mainViewDraftOf,
} from "../../../../src/browser/domain/main-view/a2ui-draft-view.ts"
import type { A2uiReportComponent } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view-entry.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { a2uiParts, STAGED_PARTS } from "../../../fixture/a2ui-component.ts"
import { partsDraftOf, SETTLED_DRAFT, WRITING_DRAFT } from "../../../fixture/a2ui-draft.ts"
import { reportEvent } from "../../../fixture/report-event.ts"

const drawnIds = (components: readonly A2uiReportComponent[]) =>
  partsDraftOf("toolu_draft", components, WRITING_DRAFT).components.map((part) => part.id)

const surfaceOf = (
  components: readonly A2uiReportComponent[],
  source: DraftSource = WRITING_DRAFT,
) => {
  const a2ui = partsDraftOf("toolu_draft", components, source).regions.a2ui
  if (a2ui.kind !== "surface") {
    throw new Error("面の値が無い")
  }
  return a2ui
}

/** 根から子の参照をたどって届く ID を、部品の並びと独立に集める。 */
function reachableFromRoot(components: readonly A2uiReportComponent[]): ReadonlySet<string> {
  const byId = new Map(components.map((part) => [part.id, part]))
  const visit = (id: string, seen: ReadonlySet<string>): ReadonlySet<string> => {
    const part = byId.get(id)
    if (part === undefined || seen.has(id)) {
      return seen
    }
    const children =
      "children" in part ? part.children : "child" in part ? [part.child] : ([] as const)
    return children.reduce<ReadonlySet<string>>(
      (acc, child) => visit(child, acc),
      new Set([...seen, id]),
    )
  }
  return visit("root", new Set())
}

describe("mainViewDraftOf", () => {
  it("根が先に届いた一覧は、根と届いた子を描き、まだ届かない子の先頭を次に届く見込みにする", () => {
    const draft = partsDraftOf("toolu_draft", STAGED_PARTS.slice(0, 3), WRITING_DRAFT)

    expect(draft.components.map((part) => part.id)).toEqual(["root", "s1", "p1"])
    expect(draft.pending).toEqual({ next: "p2", openSections: ["s1", "s2"] })
    expect(surfaceOf(STAGED_PARTS.slice(0, 3)).markdownLeaves).toEqual({})
  })

  it("根がまだ届いていない一覧は、書いている途中なら白紙の草稿にし、書いていなければ草稿にしない", () => {
    const rootless = STAGED_PARTS.slice(1)

    expect(mainViewDraftOf("toolu_draft", rootless, [], WRITING_DRAFT)).toEqual({
      kind: "blank",
      toolUseId: "toolu_draft",
    })
    expect(mainViewDraftOf("toolu_draft", [], [], WRITING_DRAFT)?.kind).toBe("blank")
    expect(mainViewDraftOf("toolu_draft", rootless, [], SETTLED_DRAFT)).toBeUndefined()
  })

  it("書いていない草稿は、届いていない部品を数えない", () => {
    const draft = partsDraftOf("toolu_draft", STAGED_PARTS.slice(0, 3), SETTLED_DRAFT)

    expect(draft.pending).toEqual({ openSections: [] })
    expect(draft.writing).toBe(false)
  })

  it("根に繋がらない部品は描かず、内容部品がまだ届いていない節は欄にせず部品にだけ残す", () => {
    const arrived = [
      ...STAGED_PARTS.slice(0, 2),
      ...a2uiParts({ id: "orphan", component: "Paragraph", text: "架空の迷子の段落" }),
    ]
    const draft = partsDraftOf("toolu_draft", arrived, WRITING_DRAFT)

    expect(draft.components.map((part) => part.id)).toEqual(["root", "s1"])
    expect(draft.regions.sections).toEqual([])
    expect(Object.keys(surfaceOf(arrived).sections)).toEqual([])
  })

  it("全部が届けば、根から辿れる部品はすべて描く一覧に残り、届いていない部品は無い", () => {
    const all = [
      ...STAGED_PARTS,
      ...a2uiParts({ id: "orphan", component: "Paragraph", text: "架空の迷子の段落" }),
    ]

    expect(new Set(drawnIds(all))).toEqual(reachableFromRoot(all))
    expect(partsDraftOf("toolu_draft", all, WRITING_DRAFT).pending).toEqual({ openSections: [] })
  })

  it("草稿の内容部品の値は、記録と同じ関数で番号と欄外注を持つ", () => {
    const parts = a2uiParts(
      {
        id: "root",
        component: "Report",
        conclusion: ["架空の結論。"],
        children: ["s1"],
      },
      { id: "s1", component: "Section", heading: "架空の節", children: ["t1", "m1"] },
      {
        id: "t1",
        component: "Table",
        title: "架空の表",
        columns: ["列", "数"],
        rows: [["値", "1"]],
      },
      { id: "m1", component: "Note", tone: "memo", text: "架空の覚え書き。" },
    )
    const a2ui = surfaceOf(parts)

    expect(a2ui.leafValues.t1?.captionNumber).toEqual({ kind: "table", ordinal: 1 })
    expect(a2ui.leafValues.t1?.gutterNotes).toEqual([{ label: "メモ", text: "架空の覚え書き。" }])
    expect(a2ui.leafValues.m1?.mergedIntoPrevious).toBe(true)
  })

  it("草稿の画像の取り出し元は、出どころが渡したものになる", () => {
    expect(surfaceOf(STAGED_PARTS, WRITING_DRAFT).imageSource).toEqual({ kind: "pending" })
    expect(surfaceOf(STAGED_PARTS, SETTLED_DRAFT).imageSource).toEqual({ kind: "none" })
  })

  it("Markdown の内容部品の Markdown が、面で描く値に載る", () => {
    const parts = a2uiParts(
      { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
      { id: "s1", component: "Section", heading: "架空の節", children: ["m1", "p1"] },
      { id: "m1", component: "Markdown", markdown: "> 架空の引用" },
      { id: "p1", component: "Paragraph", text: "架空の段落" },
    )

    expect(surfaceOf(parts).markdownLeaves).toEqual({ m1: "> 架空の引用" })
  })

  it("同じ components から、記録の面と草稿の面で markdownLeaves・leafValues・sections が変わらない", () => {
    const parts = a2uiParts(
      { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1", "s2"] },
      { id: "s1", component: "Section", heading: "架空の節一", children: ["m1", "t1", "n1", "m2"] },
      { id: "m1", component: "Markdown", markdown: "> 架空の引用" },
      {
        id: "t1",
        component: "Table",
        title: "架空の表",
        columns: ["列", "数"],
        rows: [["値", "1"]],
      },
      { id: "n1", component: "Note", tone: "memo", text: "架空の覚え書き。" },
      { id: "m2", component: "Markdown", markdown: "以上です" },
      { id: "s2", component: "Section", heading: "落ちる節", children: ["p1"] },
      { id: "p1", component: "Paragraph", text: "以上です。" },
    )
    const entry = mainViewEntries(
      applySessionEvent(
        INITIAL_SESSION_STATE,
        reportEvent({ conclusion: "架空の結論。", components: parts }),
        0,
      ),
    ).find((candidate) => candidate.kind === "report")
    const recorded = entry?.kind === "report" ? entry.regions.a2ui : undefined
    const drafted = surfaceOf(parts)
    if (recorded?.kind !== "surface") {
      throw new Error("面の値が無い")
    }

    expect(Object.keys(drafted.leafValues).toSorted()).toEqual(["m1", "n1", "t1"])
    expect(drafted.markdownLeaves).toEqual({ m1: "> 架空の引用", m2: "" })
    expect(Object.keys(drafted.sections)).toEqual(["s1"])
    expect(drafted.markdownLeaves).toEqual(recorded.markdownLeaves)
    expect(drafted.leafValues).toEqual(recorded.leafValues)
    expect(drafted.sections).toEqual(recorded.sections)
  })

  it("節の見出しが、面で描く値に載る", () => {
    const draft = partsDraftOf("toolu_draft", STAGED_PARTS, WRITING_DRAFT)

    expect(draft.regions.sections.map((section) => section.heading)).toEqual([
      "架空の節一",
      "架空の節二",
    ])
  })

  it("頭の結論の形と数のカードは、確定版と同じ決め方になる", () => {
    const keyFigures = [
      { value: "1", label: "架空の数一" },
      { value: "2", label: "架空の数二" },
      { value: "3", label: "架空の数三" },
    ]
    const [root, ...rest] = STAGED_PARTS
    const tasked = a2uiParts(
      {
        ...root,
        task: { id: "fictional-task", name: "架空の作業", outcome: "finished" },
        keyFigures,
      },
      ...rest,
    )
    const draft = partsDraftOf("toolu_draft", tasked, WRITING_DRAFT)

    expect(surfaceOf(STAGED_PARTS).head.lead).toEqual({
      kind: "conclusion-lead",
      text: "架空の結論。",
    })
    expect(surfaceOf(STAGED_PARTS).head.keyFigures).toEqual([])
    expect(draft.task).toMatchObject({ kind: "task", id: "fictional-task", name: "架空の作業" })
    expect(surfaceOf(tasked).head.lead).toEqual({ kind: "conclusion", text: "架空の結論。" })
    expect(surfaceOf(tasked).head.keyFigures.map((figure) => figure.label)).toEqual([
      "架空の数一",
      "架空の数二",
      "架空の数三",
    ])
  })
})
