import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import { reportDraft } from "../../../fixture/report-event.ts"

const textBlock = (text: string): ReportBlock => ({ kind: "text", text, fold: "", aside: "" })

const listBlock = (label: string, text: string): ReportBlock => ({
  kind: "list",
  style: "bullet",
  items: [{ label, text, done: false, source: "", branch: "", branchTone: "warn" }],
  fold: "",
  aside: "",
})

const tableBlock = (cell: string): ReportBlock => ({
  kind: "table",
  title: "架空の表",
  columns: ["列", "値"],
  rows: [["a", cell]],
  rest: "",
  fold: "",
  aside: "",
})

const brokenOf = (report: Parameters<typeof reportDraft>[0]) =>
  reportViolations(reportDraft(report)).filter(
    (violation) => violation.kind === "broken-inline-mark",
  )

const sectionOf = (...blocks: ReportBlock[]) => ({ heading: "", blocks }) as const

describe("broken-inline-mark", () => {
  it("結論・text・list の項目・table のセルの壊れた印を数える", () => {
    expect(
      brokenOf({
        conclusion: "架空の結論 {{12 → 8。",
        sections: [
          sectionOf(
            textBlock("架空の {{3 /}} と {{x}}"),
            listBlock("", "架空の {{spark: 3}}"),
            tableBlock("{{5 / 3}}"),
          ),
        ],
      }),
    ).toEqual([{ kind: "broken-inline-mark", count: 5 }])
  })

  it("list の label の壊れた印も数える", () => {
    expect(
      brokenOf({
        conclusion: "架空の結論。",
        sections: [sectionOf(listBlock("{{x}}", "架空の項目"))],
      }),
    ).toHaveLength(1)
  })

  it("flow の source・branch の壊れた印も数える", () => {
    const flow = (source: string, branch: string): ReportBlock => ({
      kind: "list",
      style: "flow",
      items: [{ label: "", text: "架空の段", done: false, source, branch, branchTone: "ng" }],
      fold: "",
      aside: "",
    })

    expect(
      brokenOf({ conclusion: "架空の結論。", sections: [sectionOf(flow("", "{{x}}"))] }),
    ).toHaveLength(1)
    expect(
      brokenOf({ conclusion: "架空の結論。", sections: [sectionOf(flow("{{x}}", ""))] }),
    ).toHaveLength(1)
  })

  it("正しい印・inline code の中・印の無い本文は違反にしない", () => {
    expect(
      brokenOf({
        conclusion: "架空の {{12 → 8}} 秒。",
        sections: [sectionOf(textBlock("`{{x` と {{3 / 5}} と {{spark: 1, 2, 3}}"))],
      }),
    ).toEqual([])
    expect(brokenOf({ conclusion: "架空の結論。" })).toEqual([])
  })

  it("差し戻しの文面は数だけで、本文の字を写さない", () => {
    const text = reportRejectionText(brokenOf({ conclusion: "架空の秘密の語 {{x}}。" }))

    expect(text).toContain("1個ある")
    expect(text).not.toContain("架空の秘密の語")
  })
})
