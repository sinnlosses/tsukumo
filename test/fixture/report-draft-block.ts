import { reportViolations } from "../../src/server/report/core/report-violation-check.ts"
import type { ReportDraft } from "../../src/server/report/core/report-violation.ts"
import { parseConclusion } from "../../src/server/session-driver/core/conclusion-sentence.ts"
import type {
  RecordedReportFigure,
  ReportBlock,
  ReportSection,
} from "../../src/shared/report/report-block.ts"
import { reportDraft } from "./report-event.ts"

/** `conclusion` は文字列なら1要素、配列なら要素の並び。 */
export const draft = (
  blocks: readonly ReportBlock[],
  conclusion: string | readonly string[] = "架空の結論。",
  sections: readonly ReportSection[] = [{ heading: "", shapeTag: "unspecified", blocks }],
  figure: RecordedReportFigure = { kind: "none", reason: "unrecorded" },
): ReportDraft =>
  reportDraft({
    ...parseConclusion(conclusion),
    figure,
    sections:
      blocks.length === 0 ? sections.filter((section) => section.blocks.length > 0) : sections,
  })

export const reportDraftText = (value: string, fold = ""): ReportBlock => ({
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
