import { describe, expect, it } from "vitest"

import type { ReportDraft } from "../../../../../../src/server/report/core/rules/draft.ts"
import {
  reportRejectionText,
  reportViolations,
} from "../../../../../../src/server/report/core/rules/report-violation.ts"
import type { RecordedReportFigure } from "../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { LeafComponent } from "../../../../../../src/shared/report/report-block.ts"
import type { FigurePreference } from "../../../../../../src/shared/session/session-default.ts"
import { mermaid, reportDraftText } from "../../../../../fixture/report-draft-block.ts"
import { reportDraft } from "../../../../../fixture/report-event.ts"

const tableOf = (rows: readonly (readonly string[])[]): LeafComponent => ({
  kind: "table",
  title: "架空の表",
  columns: ["名前", "値"],
  rows: rows.map((row) => [...row]),
  rest: "",
  fold: "",
  aside: "",
})

const orderedOf = (count: number): LeafComponent => ({
  kind: "list",
  style: "ordered",
  items: Array.from({ length: count }, (_, index) => ({
    label: "",
    text: `架空の手順${String(index + 1)}`,
    done: false,
    source: "",
    branch: "",
    branchTone: "warn",
  })),
  fold: "",
  aside: "",
})

const NAME_TABLE = tableOf([
  ["甲", "乙へ"],
  ["乙", "丙へ"],
  ["丙", "終わり"],
])

const NUMBER_TABLE = tableOf([
  ["甲", "12件"],
  ["乙", "3.5s"],
  ["丙", "40%"],
])

const LONG_PROSE = reportDraftText("架空の説明の文。".repeat(60))

const draftOf = (
  sections: readonly (readonly LeafComponent[])[],
  options: {
    readonly preference?: FigurePreference
    readonly figure?: RecordedReportFigure
  } = {},
): ReportDraft =>
  reportDraft({
    figurePreference: options.preference ?? "chart",
    figure: options.figure ?? { kind: "none", reason: "no-shape" },
    sections: sections.map((blocks, index) => ({
      heading: `架空の見出し${String(index)}`,
      blocks,
    })),
  })

const escapeOf = (report: ReportDraft) =>
  reportViolations(report).find((violation) => violation.kind === "figure-escape")

describe("図への逃げ（figure-escape）", () => {
  it("図派で図が無いと、3行以上の表・3項目以上の番号つきの手順・流れの部品・長い文を材料として位置つきで数える", () => {
    const report = draftOf([
      [NAME_TABLE, orderedOf(3)],
      [mermaid("sequenceDiagram\n  A->>B: hi"), LONG_PROSE],
    ])

    expect(escapeOf(report)).toEqual({
      kind: "figure-escape",
      count: 4,
      faults: [
        { material: "table", section: 1, part: 1 },
        { material: "steps", section: 1, part: 2 },
        { material: "shape", section: 2, part: 1 },
        { material: "prose", section: 2 },
      ],
    })
  })

  it("2列目より右がどの行も数の表は、数の列がある表として見分ける", () => {
    expect(escapeOf(draftOf([[NUMBER_TABLE]]))?.faults).toEqual([
      { material: "number-table", section: 1, part: 1 },
    ])
  })

  it("2行の表・2項目の手順・短い文は材料にしない", () => {
    const report = draftOf([
      [
        tableOf([
          ["甲", "1"],
          ["乙", "2"],
        ]),
        orderedOf(2),
        reportDraftText("架空の短い説明。"),
      ],
    ])

    expect(escapeOf(report)).toBeUndefined()
  })

  it("図を置いていれば、材料があっても差し戻さない", () => {
    const report = draftOf([[NAME_TABLE, LONG_PROSE]], {
      figure: {
        kind: "mermaid",
        title: "",
        source: "sequenceDiagram\n  A->>B: hi",
        fold: "",
        aside: "",
      },
    })

    expect(escapeOf(report)).toBeUndefined()
  })

  it("文派の既定では、図が無く材料があっても差し戻さない", () => {
    expect(escapeOf(draftOf([[NAME_TABLE]], { preference: "text" }))).toBeUndefined()
  })

  it("差し戻し文は、材料の位置と、当たった材料の直し方だけを言い、図の置き場を名指す", () => {
    const violation = escapeOf(draftOf([[NUMBER_TABLE], [LONG_PROSE]]))
    const text = reportRejectionText(violation === undefined ? [] : [violation])

    expect(text).toContain(
      "1個目のセクションの1個目の部品が数の列がある3行以上の `Table`・2個目のセクションが400字以上の文",
    )
    expect(text).toContain("`Chart`")
    expect(text).toContain("言っている中身の形")
    expect(text).toContain("`Report` の `figure`")
    expect(text).not.toContain("番号つきの手順は")
    expect(text).not.toContain("架空の説明の文")
  })
})
