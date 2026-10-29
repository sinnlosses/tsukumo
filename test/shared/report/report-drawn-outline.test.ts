import { describe, expect, it } from "vitest"

import type { A2uiReportComponent } from "../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportBlock } from "../../../src/shared/report/report-block.ts"
import { drawnReportOf } from "../../../src/shared/report/report-drawn-outline.ts"

const CONCLUSION = "架空の結論。"

const paragraph = (id: string, text: string): A2uiReportComponent => ({
  id,
  component: "Paragraph",
  text,
  fold: "",
  aside: "",
})

const markdown = (id: string, body: string): A2uiReportComponent => ({
  id,
  component: "Markdown",
  markdown: body,
  fold: "",
  aside: "",
})

const mermaid = (id: string): A2uiReportComponent => ({
  id,
  component: "Mermaid",
  title: "架空の図",
  source: "flowchart TD\n  A --> B",
  fold: "",
  aside: "",
})

const section = (
  id: string,
  heading: string,
  children: readonly string[],
): A2uiReportComponent => ({
  id,
  component: "Section",
  heading,
  children: [...children],
})

const text = (value: string): ReportBlock => ({ kind: "text", text: value, fold: "", aside: "" })

const FIGURE_BLOCK: ReportBlock = {
  kind: "mermaid",
  title: "架空の図",
  source: "flowchart TD\n  A --> B",
  fold: "",
  aside: "",
}

const WITH_FIGURE: readonly A2uiReportComponent[] = [
  { id: "root", component: "Report", children: ["s1"], figure: "f1" },
  section("s1", "架空の節", ["p1", "m1"]),
  paragraph("p1", "架空の根拠。"),
  markdown("m1", "- 架空の項目"),
  mermaid("f1"),
]

const WITH_RETROSPECTIVE: readonly A2uiReportComponent[] = [
  {
    id: "root",
    component: "Report",
    children: ["s1"],
    retrospective: { summary: "架空の結果", drafts: ["draft-a"], blocks: ["r1"] },
  },
  section("s1", "架空の節", ["p1"]),
  paragraph("p1", "架空の根拠。"),
  paragraph("r1", "架空の振り返りの根拠。"),
]

const WITH_DROPPED: readonly A2uiReportComponent[] = [
  { id: "root", component: "Report", children: ["s1", "s2", "l1"], figure: "f1" },
  section("s1", "落ちる節", ["p1", "p2"]),
  section("s2", "残る節", ["p3"]),
  paragraph("l1", "見出しの無い節の本文。"),
  paragraph("p1", CONCLUSION),
  paragraph("p2", "以上です。"),
  paragraph("p3", "架空の根拠。"),
  mermaid("f1"),
]

describe("drawnReportOf", () => {
  it("whole は図 → 本文の節 → 振り返りの順に、塊の節を並べる", () => {
    const figure = drawnReportOf(WITH_FIGURE, CONCLUSION, "whole")
    const retrospective = drawnReportOf(WITH_RETROSPECTIVE, CONCLUSION, "whole")

    expect(figure.sections.map((entry) => entry.section)).toEqual([
      { heading: "", shapeTag: "unspecified", blocks: [FIGURE_BLOCK] },
      {
        heading: "架空の節",
        shapeTag: "unspecified",
        blocks: [
          text("架空の根拠。"),
          { kind: "markdown", markdown: "- 架空の項目", fold: "", aside: "" },
        ],
      },
    ])
    expect(retrospective.sections.map((entry) => entry.section)).toEqual([
      { heading: "架空の節", shapeTag: "unspecified", blocks: [text("架空の根拠。")] },
      {
        heading: "振り返り",
        shapeTag: "unspecified",
        blocks: [
          text("架空の結果"),
          text("架空の振り返りの根拠。"),
          text("積んだドラフト: `draft-a`"),
        ],
      },
    ])
  })

  it("整形で落ちた葉と、葉が残らない節は含めず、落ちた葉の ID を返す", () => {
    const drawn = drawnReportOf(WITH_DROPPED, CONCLUSION, "whole")

    expect(drawn.sections.map((entry) => [entry.role, entry.componentId])).toEqual([
      ["figure", undefined],
      ["body", "s2"],
      ["body", "l1"],
    ])
    expect([...drawn.droppedLeafIds].toSorted()).toEqual(["p1", "p2"])
  })

  it("body は図と振り返りを含めず、本文の節に根の子の部品の ID を添える", () => {
    const drawn = drawnReportOf(WITH_DROPPED, CONCLUSION, "body")

    expect(drawn.sections.map((entry) => [entry.role, entry.componentId])).toEqual([
      ["body", "s2"],
      ["body", "l1"],
    ])
    expect(drawnReportOf(WITH_RETROSPECTIVE, CONCLUSION, "body").sections).toHaveLength(1)
  })

  it("振り返りの要約とドラフトの行は葉の ID を持たず、葉は ID を持つ", () => {
    const retrospective = drawnReportOf(WITH_RETROSPECTIVE, CONCLUSION, "whole").sections.at(-1)

    expect(retrospective?.role).toBe("retrospective")
    expect(retrospective?.entries.map((entry) => entry.leafId)).toEqual([
      undefined,
      "r1",
      undefined,
    ])
  })
})
