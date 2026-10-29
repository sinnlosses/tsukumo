import { describe, expect, it } from "vitest"

import { reportUsageEntryOf } from "../../../../src/server/report/core/report-usage.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { A2uiReportComponent } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import { draft, markdown, reportDraftText } from "../../../fixture/report-draft-block.ts"
import {
  type LegacySectionInput,
  reportDraft,
  reportOfSections,
} from "../../../fixture/report-event.ts"

const info = (): ReportBlock => ({
  kind: "note",
  tone: "info",
  text: "架空の一文。",
  fold: "",
  aside: "",
})

/** 旧い記録の `row`・`panel`。今の型には無いので、組み直しへ渡す生の値で置く。 */
const row = (blocks: readonly ReportBlock[], fold = "", aside = ""): unknown => ({
  kind: "row",
  blocks,
  fold,
  aside,
})

const panel = (blocks: readonly ReportBlock[], fold = "", aside = ""): unknown => ({
  kind: "panel",
  title: "架空の枠",
  blocks,
  fold,
  aside,
})

describe("row・panel の中と外で同じ並べ方の判定", () => {
  describe("隣り合う note", () => {
    it.each([
      ["節に縦に続く note", [info(), info()], 1],
      ["row の中で続く note 2つは、平らな並びで隣り合う", [row([info(), info()])], 1],
      [
        "row の外の note と中の先頭の note は隣り合う",
        [info(), row([info(), reportDraftText("架空")])],
        1,
      ],
      [
        "row の中の末尾の note と、そのあとの節直下の note は隣り合う",
        [row([reportDraftText("架空"), info()]), info()],
        1,
      ],
    ] as const)("%s", (_, blocks, expected) => {
      expect(crowdedNotesIn(sectionsOf(blocks))).toBe(expected)
    })

    it.each([
      ["Section[Note, Row[Note, Note]]", ["row"], 2],
      ["Section[Note, Card[Column[Note]]]", ["card"], 1],
    ] as const)("a2ui の入力 %s は平らな並びのとおりに数える", (_, [layout], expected) => {
      const note = (id: string): A2uiReportComponent => ({
        id,
        component: "Note",
        tone: "info",
        text: "架空の一文。",
        fold: "",
        aside: "",
      })
      const placed: readonly A2uiReportComponent[] =
        layout === "row"
          ? [{ id: "layout", component: "Row", children: ["n2", "n3"] }, note("n2"), note("n3")]
          : [
              { id: "layout", component: "Card", child: "column" },
              { id: "column", component: "Column", children: ["n2"] },
              note("n2"),
            ]
      const components: readonly A2uiReportComponent[] = [
        { id: "root", component: "Report", children: ["section"] },
        { id: "section", component: "Section", heading: "", children: ["n1", "layout"] },
        note("n1"),
        ...placed,
      ]

      const violation = reportViolations(reportDraft({ components })).find(
        (candidate) => candidate.kind === "crowded-notes",
      )

      expect(violation?.count).toBe(expected)
    })

    it("row の中の note も、1つのレポートの note の数には入る", () => {
      expect(countOf(sectionsOf([row([info(), info()]), info()]), "too-many-notes")).toBe(3)
    })
  })

  describe("畳みの入れ子", () => {
    it("fold を持つ markdown が details を含めば、row の中でも数える", () => {
      const nested: ReportBlock = {
        ...markdown("<details>\n\n架空\n\n</details>"),
        fold: "架空の畳み",
      }

      expect(nestedFoldsIn(sectionsOf([row([nested, reportDraftText("架空")])]))).toBe(1)
    })
  })

  describe("傍注の欄の集計", () => {
    it.each([
      ["葉の塊の aside", [{ ...reportDraftText("架空"), aside: "架空の出典" }], ["blockAside"]],
      [
        "row 自身の aside は部品に写らないので数えない",
        [row([reportDraftText("架空"), reportDraftText("架空")], "", "架空の出典")],
        [],
      ],
      [
        "panel 自身の aside は部品に写らないので数えない",
        [panel([reportDraftText("架空")], "", "架空の出典")],
        [],
      ],
      [
        "panel の子の aside",
        [panel([{ ...reportDraftText("架空"), aside: "架空の出典" }])],
        ["blockAside"],
      ],
      ["どこにも aside が無い", [panel([reportDraftText("架空")])], []],
    ] as const)("%s", (_, blocks, expected) => {
      const entry = reportUsageEntryOf(
        reportOfSections(sectionsOf(blocks)),
        "claude-session-1",
        1_000,
        false,
      )

      expect(entry.blockFields).toEqual(expected)
    })
  })
})

function sectionsOf(blocks: readonly unknown[]): readonly LegacySectionInput[] {
  return [{ heading: "", blocks }]
}

function crowdedNotesIn(sections: readonly LegacySectionInput[]): number {
  return countOf(sections, "crowded-notes")
}

function nestedFoldsIn(sections: readonly LegacySectionInput[]): number {
  return countOf(sections, "nested-fold")
}

function countOf(sections: readonly LegacySectionInput[], kind: string): number {
  const violation = reportViolations(draft([], "架空の結論。", sections)).find(
    (candidate) => candidate.kind === kind,
  )
  return violation !== undefined && "count" in violation ? violation.count : 0
}
