import { parseConclusion } from "../../src/server/report/core/body/conclusion-sentence.ts"
import type { ReportDraft } from "../../src/server/report/core/rules/draft.ts"
import { reportViolations } from "../../src/server/report/core/rules/report-violation.ts"
import type { RecordedReportFigure } from "../../src/shared/report/a2ui-report-catalog.ts"
import type { LeafComponent } from "../../src/shared/report/report-block.ts"
import { type LegacySectionInput, reportDraft } from "./report-event.ts"

/** `conclusion` は文字列なら1要素、配列なら要素の並び。 */
export const draft = (
  blocks: readonly LeafComponent[],
  conclusion: string | readonly string[] = "架空の結論。",
  sections: readonly LegacySectionInput[] = [{ heading: "", blocks }],
  figure: RecordedReportFigure = { kind: "none", reason: "unrecorded" },
): ReportDraft =>
  reportDraft({
    ...parseConclusion(conclusion),
    figure,
    sections:
      blocks.length === 0 ? sections.filter((section) => section.blocks.length > 0) : sections,
  })

export const reportDraftText = (value: string, fold = ""): LeafComponent => ({
  kind: "text",
  text: value,
  fold,
  aside: "",
})
export const markdown = (value: string): LeafComponent => ({
  kind: "markdown",
  markdown: value,
  fold: "",
  aside: "",
})
export const mermaid = (source: string): LeafComponent => ({
  kind: "mermaid",
  title: "",
  source,
  fold: "",
  aside: "",
})
export const note = (): LeafComponent => ({
  kind: "note",
  tone: "warn",
  text: "架空の一文。",
  fold: "",
  aside: "",
})
export const code = (path: string, source: string, language = "text"): LeafComponent => ({
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
