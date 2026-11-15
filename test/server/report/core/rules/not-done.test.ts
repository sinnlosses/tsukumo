import { describe, expect, it } from "vitest"

import { REPORT_REJECTION_MODES } from "../../../../../src/server/report/core/rules/rejection-mode.ts"
import { reportViolations } from "../../../../../src/server/report/core/rules/report-violation.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import { type ReportDraftInput, reportDraft } from "../../../../fixture/report-event.ts"

const rootOf = (notDone?: readonly string[]): A2uiReportComponent => ({
  id: "root",
  component: "Report",
  children: ["sec"],
  ...(notDone === undefined ? {} : { notDone: [...notDone] }),
})

const section: A2uiReportComponent = {
  id: "sec",
  component: "Section",
  heading: "",
  children: ["p"],
}

const paragraph: A2uiReportComponent = {
  id: "p",
  component: "Paragraph",
  text: "架空の文。",
  fold: "",
  aside: "",
}

const task: ReportDraftInput["task"] = {
  kind: "task",
  id: "T-1",
  name: "架空の作業",
  outcome: "finished",
  genre: "unspecified",
}

const omittedOf = (input: ReportDraftInput) =>
  reportViolations(reportDraft(input)).filter((violation) => violation.kind === "omitted-not-done")

describe("やっていないこと（notDone）の省き", () => {
  it("task があって notDone を省くと、1件として数える", () => {
    expect(omittedOf({ task, components: [rootOf(), section, paragraph] })).toEqual([
      { kind: "omitted-not-done", count: 1 },
    ])
  })

  it("空の並びを渡せば数えない", () => {
    expect(omittedOf({ task, components: [rootOf([]), section, paragraph] })).toEqual([])
  })

  it("task が無いレポートで省いても数えない", () => {
    expect(omittedOf({ components: [rootOf(), section, paragraph] })).toEqual([])
  })

  it("数えるだけの条で、差し戻さない", () => {
    expect(REPORT_REJECTION_MODES["omitted-not-done"]).toBe("count")
  })
})
