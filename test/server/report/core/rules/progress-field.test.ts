import { describe, expect, it } from "vitest"

import { detectProgressFieldViolations } from "../../../../../src/server/report/core/rules/progress-field.ts"
import { reportOutline } from "../../../../../src/shared/report/report-outline.ts"
import { type ReportDraftInput, reportDraft } from "../../../../fixture/report-event.ts"

function countOf(kind: string, input: ReportDraftInput): number {
  const draft = reportDraft(input)
  return (
    detectProgressFieldViolations(draft, reportOutline(draft.components)).find(
      (violation) => violation.kind === kind,
    )?.count ?? -1
  )
}

const textSection = (text: string) => [{ heading: "架空の節", blocks: [{ kind: "text", text }] }]

describe("detectProgressFieldViolations", () => {
  it("verdict-closing-mismatch は、読み替えが立てた食い違いの印をそのまま数える", () => {
    expect(countOf("verdict-closing-mismatch", { closingConflict: true })).toBe(1)
    expect(countOf("verdict-closing-mismatch", { closingConflict: false })).toBe(0)
  })

  it("source-mismatch は、本文と結論の {{src: n}} と sources の片方にだけある番号を数える", () => {
    expect(
      countOf("source-mismatch", {
        conclusion: "架空の結論{{src: 1}}。",
        sections: textSection("架空の根拠{{src: 3}}。"),
        sources: [
          { mark: 1, place: "a.ts:1" },
          { mark: 2, place: "b.ts:1" },
        ],
      }),
    ).toBe(2)
    expect(
      countOf("source-mismatch", {
        sections: textSection("架空の根拠{{src: 1}}。`{{src: 9}}` は読まない"),
        sources: [{ mark: 1, place: "a.ts:1" }],
      }),
    ).toBe(0)
    expect(countOf("source-mismatch", {})).toBe(0)
  })

  it("guide-note-misplaced は、4つ以上なら1、存在しない target の数を足す", () => {
    const note = (target: string) => ({ target, text: "架空の案内" })

    expect(
      countOf("guide-note-misplaced", { guideNotes: [note("checks"), note("conclusion")] }),
    ).toBe(0)
    expect(
      countOf("guide-note-misplaced", {
        guideNotes: [note("checks"), note("conclusion"), note("favor"), note("架空の部品")],
      }),
    ).toBe(2)
  })

  it("guide-note-misplaced は、部品の ID を target にした付箋を外れにしない", () => {
    const draft = reportDraft({ sections: textSection("架空の本文。") })
    const id = draft.components.find((component) => component.component !== "Report")?.id ?? ""

    expect(id).not.toBe("")
    expect(
      countOf("guide-note-misplaced", { ...draft, guideNotes: [{ target: id, text: "架空" }] }),
    ).toBe(0)
  })
})
