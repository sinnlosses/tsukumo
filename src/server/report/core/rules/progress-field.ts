// 判定・出どころ・案内の付箋の欄の検査の家族。違反の型・検出・差し戻し文を持つ。違反は数だけを持ち、本文の字は持たない。

import { parseInlineMarks } from "../../../../shared/report/inline-mark.ts"
import { REPORT_ARGUMENT_FIELDS } from "../../../../shared/report/report-argument-size.ts"
import type { ReportOutline } from "../../../../shared/report/report-outline.ts"
import type { ReportDraft } from "./draft.ts"
import { inlineMarkTexts } from "./prose/inline-mark.ts"

/** 案内の付箋のうち、描く数。 */
const MAX_GUIDE_NOTES = 3

export type ProgressFieldViolation =
  /** 書いた `verdict` と書いた `workPlanClosing` が食い違う。`count` は 1。 */
  | { readonly kind: "verdict-closing-mismatch"; readonly count: number }
  /** 本文の `{{src: n}}` の番号と `sources[].mark` の番号の、片方にだけある番号の数。 */
  | { readonly kind: "source-mismatch"; readonly count: number }
  /** 描く数を超えた案内の付箋（超えたら 1）と、部品の ID にも欄の名前にも無い `target` の数の和。 */
  | { readonly kind: "guide-note-misplaced"; readonly count: number }

/** 違反を、当てはまらないもの（`count` が 0）も含めて並べる。 */
export function detectProgressFieldViolations(
  report: ReportDraft,
  outline: ReportOutline,
): readonly ProgressFieldViolation[] {
  return [
    { kind: "verdict-closing-mismatch", count: report.closingConflict ? 1 : 0 },
    { kind: "source-mismatch", count: sourceMismatchCount(report, outline) },
    { kind: "guide-note-misplaced", count: misplacedGuideNoteCount(report) },
  ]
}

export function isProgressFieldViolation(violation: {
  readonly kind: string
}): violation is ProgressFieldViolation {
  return (
    violation.kind === "verdict-closing-mismatch" ||
    violation.kind === "source-mismatch" ||
    violation.kind === "guide-note-misplaced"
  )
}

export function progressFieldViolationMessage(violation: ProgressFieldViolation): string {
  switch (violation.kind) {
    case "verdict-closing-mismatch":
      return "`verdict` と `workPlanClosing` が食い違っている。`done`・`partial` なら `finished`、ほかは `stopped` にするか、`workPlanClosing` を省く"
    case "source-mismatch":
      return `本文の \`{{src: n}}\` の番号と \`sources\` の \`mark\` が${violation.count}個食い違っている。本文で使う番号だけを \`sources\` に書く`
    case "guide-note-misplaced":
      return `\`guideNotes\` は${MAX_GUIDE_NOTES}つまでで、\`target\` は部品の ID か欄の名前にする（外れが${violation.count}個）`
  }
}

function sourceMismatchCount(report: ReportDraft, outline: ReportOutline): number {
  const used = new Set(
    inlineMarkTexts(report, outline).flatMap((text) =>
      parseInlineMarks(text).flatMap((segment) =>
        segment.kind === "mark" && segment.mark.kind === "source" ? [segment.mark.number] : [],
      ),
    ),
  )
  const listed = new Set(report.sources.map((source) => source.mark))
  return (
    [...used].filter((mark) => !listed.has(mark)).length +
    [...listed].filter((mark) => !used.has(mark)).length
  )
}

function misplacedGuideNoteCount(report: ReportDraft): number {
  const targets = new Set<string>([
    ...report.components.map((component) => component.id),
    ...REPORT_ARGUMENT_FIELDS,
  ])
  const tooMany = report.guideNotes.length > MAX_GUIDE_NOTES ? 1 : 0
  return tooMany + report.guideNotes.filter((note) => !targets.has(note.target)).length
}
