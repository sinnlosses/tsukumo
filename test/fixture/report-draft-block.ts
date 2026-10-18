import { reportViolations } from "../../src/server/report/core/report-violation-check.ts"
import type { ReportDraft } from "../../src/server/report/core/report-violation.ts"
import type { ReportBlock, ReportSection } from "../../src/shared/report/report-block.ts"
import { reportDraft } from "./report-event.ts"

export const draft = (
  blocks: readonly ReportBlock[],
  conclusion = "架空の結論。",
  sections: readonly ReportSection[] = [{ heading: "", shapeTag: "unspecified", blocks }],
): ReportDraft =>
  reportDraft({
    conclusion,
    sections:
      blocks.length === 0 ? sections.filter((section) => section.blocks.length > 0) : sections,
  })

export const text = (value: string, fold = ""): ReportBlock => ({
  kind: "text",
  text: value,
  fold,
  aside: "",
})
export const markdown = (value: string): ReportBlock => ({
  kind: "markdown",
  markdown: value,
  fold: "",
  aside: "",
})
export const mermaid = (source: string): ReportBlock => ({
  kind: "mermaid",
  title: "",
  source,
  fold: "",
  aside: "",
})
export const note = (): ReportBlock => ({
  kind: "note",
  tone: "warn",
  text: "架空の一文。",
  fold: "",
  aside: "",
})
export const code = (path: string, source: string, language = "text"): ReportBlock => ({
  kind: "code",
  language,
  path,
  source,
  marks: [],
  fold: "",
  aside: "",
})

export const kinds = (report: ReportDraft) =>
  reportViolations(report).map((violation) => violation.kind)
