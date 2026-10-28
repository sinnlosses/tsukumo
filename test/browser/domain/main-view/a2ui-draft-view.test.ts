import { describe, expect, it } from "vitest"

import { mainViewDraftOf } from "../../../../src/browser/domain/main-view/a2ui-draft-view.ts"
import type { A2uiReportComponent } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import { a2uiParts, STAGED_PARTS } from "../../../fixture/a2ui-component.ts"

const drawnIds = (components: readonly A2uiReportComponent[]) =>
  mainViewDraftOf("toolu_draft", components)?.components.map((part) => part.id)

const leavesOf = (components: readonly A2uiReportComponent[]) => {
  const a2ui = mainViewDraftOf("toolu_draft", components)?.regions.a2ui
  return a2ui?.kind === "surface" ? a2ui.leaves : {}
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
  it("根が先に届いた一覧は、根と届いた子を描き、まだ届かない子は描かない", () => {
    const arrived = STAGED_PARTS.slice(0, 3)

    expect(drawnIds(arrived)).toEqual(["root", "s1", "p1"])
    expect(leavesOf(arrived)).toEqual({ p1: "架空の段落一" })
  })

  it("根がまだ届いていない一覧は、子が届いていても草稿にしない", () => {
    expect(mainViewDraftOf("toolu_draft", STAGED_PARTS.slice(1))).toBeUndefined()
  })

  it("根に繋がらない部品と、葉がまだ1つも届いていない節は描かない", () => {
    const arrived = [
      ...STAGED_PARTS.slice(0, 2),
      ...a2uiParts({ id: "orphan", component: "Paragraph", text: "架空の迷子の段落" }),
    ]

    expect(drawnIds(arrived)).toEqual(["root"])
  })

  it("全部が届けば、根から辿れる部品はすべて描く一覧に残る", () => {
    const all = [
      ...STAGED_PARTS,
      ...a2uiParts({ id: "orphan", component: "Paragraph", text: "架空の迷子の段落" }),
    ]

    expect(new Set(drawnIds(all))).toEqual(reachableFromRoot(all))
  })

  it("葉の Markdown と節の見出しが、面で描く値に載る", () => {
    const draft = mainViewDraftOf("toolu_draft", STAGED_PARTS)

    expect(leavesOf(STAGED_PARTS)).toEqual({
      p1: "架空の段落一",
      p2: "架空の段落二",
      p3: "架空の段落三",
    })
    expect(draft?.regions.sections.map((section) => section.heading)).toEqual([
      "架空の節一",
      "架空の節二",
    ])
    expect(draft?.regions.head).toContain("架空の結論。")
  })
})
