import { describe, expect, it } from "vitest"

import type { A2uiReportComponent } from "../../../src/shared/report/a2ui-report-catalog.ts"
import type { A2uiReportPart } from "../../../src/shared/report/a2ui-report-outline.ts"
import { reportFigureOf, reportOutline } from "../../../src/shared/report/report-outline.ts"

function note(id: string): A2uiReportComponent {
  return { id, component: "Note", tone: "info", text: "架空の一文", fold: "", aside: "" }
}

function paragraph(id: string): A2uiReportComponent {
  return { id, component: "Paragraph", text: "架空の本文", fold: "", aside: "" }
}

function report(
  fields: Partial<Pick<A2uiReportPart<"Report">, "figure" | "retrospective">>,
  children: readonly string[],
): A2uiReportComponent {
  return { id: "root", component: "Report", children: [...children], ...fields }
}

function idsOf(leaves: readonly { readonly id: string }[]): readonly string[] {
  return leaves.map((leaf) => leaf.id)
}

describe("reportFigureOf", () => {
  it("図の葉があれば、その種類を返す", () => {
    const figure: A2uiReportComponent = {
      id: "f1",
      component: "Mermaid",
      title: "架空の図",
      source: "flowchart TD\n  A --> B",
      fold: "",
      aside: "",
    }
    expect(reportFigureOf([report({ figure: "f1" }, []), figure])).toEqual({ kind: "mermaid" })
  })

  it("figureNone は理由つきの none を返す", () => {
    const root: A2uiReportComponent = {
      id: "root",
      component: "Report",
      children: [],
      figureNone: "short-answer",
    }
    expect(reportFigureOf([root])).toEqual({
      kind: "none",
      reason: "short-answer",
    })
  })

  it("どちらも無ければ unrecorded の none を返す", () => {
    expect(reportFigureOf([report({}, [])])).toEqual({ kind: "none", reason: "unrecorded" })
    expect(reportFigureOf([])).toEqual({ kind: "none", reason: "unrecorded" })
  })
})

describe("reportOutline", () => {
  it("根が無ければ空", () => {
    expect(reportOutline([note("n1")])).toEqual({ sections: [], figure: [], retrospective: [] })
  })

  it("節ごとに葉を並び順で返す", () => {
    const outline = reportOutline([
      report({}, ["s1", "s2"]),
      { id: "s1", component: "Section", heading: "架空の見出し", children: ["p1", "n1"] },
      { id: "s2", component: "Section", heading: "架空の別の見出し", children: ["p2"] },
      paragraph("p1"),
      note("n1"),
      paragraph("p2"),
    ])

    expect(outline.sections.map((section) => section.kind)).toEqual(["section", "section"])
    expect(idsOf(outline.sections[0]?.leaves ?? [])).toEqual(["p1", "n1"])
    expect(idsOf(outline.sections[1]?.leaves ?? [])).toEqual(["p2"])
  })

  it("配置の部品の入れ子の中の葉は、外側の節へ並び順に平らに入る", () => {
    const outline = reportOutline([
      report({}, ["s1"]),
      { id: "s1", component: "Section", heading: "架空の見出し", children: ["p1", "row", "p2"] },
      { id: "row", component: "Row", children: ["n1", "col"] },
      { id: "col", component: "Column", children: ["n2"] },
      paragraph("p1"),
      paragraph("p2"),
      note("n1"),
      note("n2"),
    ])

    expect(idsOf(outline.sections[0]?.leaves ?? [])).toEqual(["p1", "n1", "n2", "p2"])
  })

  it("Section でない根の子は、葉が残るときだけ見出しの無い節になる", () => {
    const outline = reportOutline([
      report({}, ["row", "empty"]),
      { id: "row", component: "Row", children: ["n1"] },
      { id: "empty", component: "Row", children: [] },
      note("n1"),
    ])

    expect(outline.sections).toHaveLength(1)
    expect(outline.sections[0]?.kind).toBe("loose")
    expect(idsOf(outline.sections[0]?.leaves ?? [])).toEqual(["n1"])
  })

  it("figure と retrospective.blocks の葉を欄ごとに返す", () => {
    const outline = reportOutline([
      report(
        {
          figure: "f1",
          retrospective: { summary: "架空の結果", drafts: [], blocks: ["r1", "row"] },
        },
        ["s1"],
      ),
      { id: "s1", component: "Section", heading: "架空の見出し", children: ["p1"] },
      { id: "row", component: "Row", children: ["r2"] },
      paragraph("p1"),
      paragraph("f1"),
      paragraph("r1"),
      paragraph("r2"),
    ])

    expect(idsOf(outline.figure)).toEqual(["f1"])
    expect(idsOf(outline.retrospective)).toEqual(["r1", "r2"])
  })

  it("辿れない参照と循環は飛ばす", () => {
    const outline = reportOutline([
      report({ figure: "missing" }, ["s1", "gone"]),
      { id: "s1", component: "Section", heading: "架空の見出し", children: ["row", "p1"] },
      { id: "row", component: "Row", children: ["row"] },
      paragraph("p1"),
    ])

    expect(outline.figure).toEqual([])
    expect(idsOf(outline.sections[0]?.leaves ?? [])).toEqual(["p1"])
  })
})
