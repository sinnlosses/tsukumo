import { describe, expect, it } from "vitest"

import { reportUsageEntryOf } from "../../../../src/server/report/core/report-usage.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type {
  ReportBlock,
  ReportSection,
  SectionBlock,
} from "../../../../src/shared/report/report-block.ts"
import { draft, markdown, reportDraftText } from "../../../fixture/report-draft-block.ts"
import { reportOfSections } from "../../../fixture/report-event.ts"

const info = (): ReportBlock => ({
  kind: "note",
  tone: "info",
  text: "架空の一文。",
  fold: "",
  aside: "",
})

type ArrangedChild = Extract<SectionBlock, { readonly kind: "row" }>["blocks"][number]

const row = (blocks: readonly ReportBlock[], fold = "", aside = ""): SectionBlock => ({
  kind: "row",
  blocks: childrenOf(blocks),
  fold,
  aside,
})

const panel = (blocks: readonly ReportBlock[], fold = "", aside = ""): SectionBlock => ({
  kind: "panel",
  title: "架空の枠",
  blocks: childrenOf(blocks),
  fold,
  aside,
})

/** 子に置けない `files` を型から外す（架空の子に `files` は使わない）。 */
function childrenOf(blocks: readonly ReportBlock[]): readonly ArrangedChild[] {
  return blocks.filter((block): block is ArrangedChild => block.kind !== "files")
}

describe("row・panel の中と外で同じ並べ方の判定", () => {
  describe("隣り合う note", () => {
    it.each([
      ["節に縦に続く note", [info(), info()], 1],
      ["panel の中で縦に続く note", [panel([info(), info()])], 1],
      [
        "row の子は横に並び縦に続かないので、row の中の note 2つは数えない",
        [row([info(), info()])],
        0,
      ],
      [
        "panel の題は節の見出しではないので、panel の先頭の note は数えない",
        [panel([info(), reportDraftText("架空の段落。")])],
        0,
      ],
      ["panel の外の note と中の先頭の note は枠を挟むので数えない", [info(), panel([info()])], 0],
    ] as const)("%s", (_, blocks, expected) => {
      expect(crowdedNotesIn(sectionsOf(blocks))).toBe(expected)
    })
  })

  describe("畳みの入れ子", () => {
    it.each([
      [
        "fold を持つ panel の子が fold を持つ",
        [panel([reportDraftText("架空", "架空の子の畳み")], "架空の畳み")],
        1,
      ],
      [
        "fold を持つ row の子の markdown が details を含む",
        [row([markdown("<details>\n\n架空\n\n</details>"), reportDraftText("架空")], "架空の畳み")],
        1,
      ],
      ["fold を持つ panel の子に畳みが無い", [panel([reportDraftText("架空")], "架空の畳み")], 0],
      [
        "fold の無い panel の子が fold を持つ",
        [panel([reportDraftText("架空", "架空の子の畳み")])],
        0,
      ],
    ] as const)("%s", (_, blocks, expected) => {
      expect(nestedFoldsIn(sectionsOf(blocks))).toBe(expected)
    })
  })

  describe("傍注の欄の集計", () => {
    it.each([
      ["葉の塊の aside", [{ ...reportDraftText("架空"), aside: "架空の出典" }], ["blockAside"]],
      [
        "row 自身の aside",
        [row([reportDraftText("架空"), reportDraftText("架空")], "", "架空の出典")],
        ["blockAside"],
      ],
      ["panel 自身の aside", [panel([reportDraftText("架空")], "", "架空の出典")], ["blockAside"]],
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

function sectionsOf(blocks: readonly SectionBlock[]): readonly ReportSection[] {
  return [{ heading: "", shapeTag: "unspecified", blocks }]
}

function crowdedNotesIn(sections: readonly ReportSection[]): number {
  return countOf(sections, "crowded-notes")
}

function nestedFoldsIn(sections: readonly ReportSection[]): number {
  return countOf(sections, "nested-fold")
}

function countOf(sections: readonly ReportSection[], kind: string): number {
  const violation = reportViolations(draft([], "架空の結論。", sections)).find(
    (candidate) => candidate.kind === kind,
  )
  return violation !== undefined && "count" in violation ? violation.count : 0
}
