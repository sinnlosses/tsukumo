import { describe, expect, it } from "vitest"

import type { ReportDraft } from "../../../../../src/server/report/core/rules/draft.ts"
import {
  reportRejectionText,
  reportViolations,
} from "../../../../../src/server/report/core/rules/report-violation.ts"
import type { ReportTerm } from "../../../../../src/shared/report/report-term.ts"
import { draft, reportDraftText } from "../../../../fixture/report-draft-block.ts"

const TERM: ReportTerm = { term: "架空語", note: "架空の注。" }

/** 根の `Report` に `terms` を足したレポート。 */
function withTerms(report: ReportDraft, terms: readonly ReportTerm[]): ReportDraft {
  return {
    ...report,
    components: report.components.map((part) =>
      part.component === "Report" ? { ...part, terms: [...terms] } : part,
    ),
  }
}

describe("用語の注の照らし合わせ", () => {
  it("本文にある語だけなら何も出ない", () => {
    const report = withTerms(draft([reportDraftText("架空語の文。")]), [TERM])
    expect(reportViolations(report)).toEqual([])
  })

  it("本文に無い語は absent-term で、その語を持つ", () => {
    const report = withTerms(draft([reportDraftText("架空語の文。")]), [
      TERM,
      { term: "無い語", note: "架空の注。" },
    ])
    expect(reportViolations(report)).toEqual([{ kind: "absent-term", count: 1, terms: ["無い語"] }])
  })

  it("結論と inline code の中にしか無い語も absent-term", () => {
    const report = withTerms(draft([reportDraftText("`架空語` の文。")], "架空語の結論。"), [TERM])
    expect(reportViolations(report)).toEqual([{ kind: "absent-term", count: 1, terms: ["架空語"] }])
  })

  it("同じ語が2回あると duplicate-term", () => {
    const report = withTerms(draft([reportDraftText("架空語の文。")]), [TERM, TERM])
    expect(reportViolations(report)).toEqual([
      { kind: "duplicate-term", count: 1, terms: ["架空語"] },
    ])
  })

  it("差し戻しの文に本文と注の字を写さない", () => {
    const report = withTerms(draft([reportDraftText("架空の秘密の文。")]), [
      { term: "無い語", note: "秘密の注。" },
    ])
    const text = reportRejectionText(reportViolations(report))

    expect(text).toContain("無い語")
    expect(text).not.toContain("秘密")
  })
})
