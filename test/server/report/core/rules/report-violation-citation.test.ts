import { describe, expect, it } from "vitest"

import { isCitationViolation } from "../../../../../src/server/report/core/rules/citation.ts"
import type { ReportDraft } from "../../../../../src/server/report/core/rules/draft.ts"
import {
  reportRejectionText,
  reportViolations,
} from "../../../../../src/server/report/core/rules/report-violation.ts"
import { a2uiReportComponentSchema } from "../../../../../src/shared/report/a2ui-report-catalog.ts"
import { PART_EXAMPLES } from "../../../../../src/shared/report/part-example-list.ts"
import type { LeafComponent } from "../../../../../src/shared/report/report-block.ts"
import type { ReportSource } from "../../../../../src/shared/report/report-source.ts"
import { draft, reportDraftText } from "../../../../fixture/report-draft-block.ts"

const S1: ReportSource = { id: "s1", title: "架空の出典1", url: "https://example.com/a" }
const S2: ReportSource = { id: "s2", title: "架空の出典2", url: "https://example.com/b" }
const S3: ReportSource = { id: "s3", title: "架空の出典3", url: "https://example.com/c" }
const S4: ReportSource = { id: "s4", title: "架空の出典4", url: "https://example.com/d" }

const TABLE: LeafComponent = {
  kind: "table",
  title: "架空の表",
  columns: ["列", "値"],
  rows: [["架空{{cite: s2}}", "1"]],
  rest: "",
  fold: "",
  aside: "",
}

const LIST: LeafComponent = {
  kind: "list",
  style: "bullet",
  items: [
    {
      label: "",
      text: "架空の項目{{cite: s3}}",
      done: false,
      source: "",
      branch: "",
      branchTone: "warn",
    },
  ],
  fold: "",
  aside: "",
}

const CLAIMS: LeafComponent = {
  kind: "claims",
  items: [
    {
      certainty: "confirmed",
      claim: "架空の主張",
      basis: "架空の根拠{{cite: s4 s1}}",
      howToVerify: "",
    },
  ],
  fold: "",
  aside: "",
}

const CITED_EVERYWHERE = [reportDraftText("架空の文{{cite: s1}}。"), TABLE, LIST, CLAIMS]

/** 根の `Report` に `sources` を足したレポート。 */
function withSources(report: ReportDraft, sources: readonly ReportSource[]): ReportDraft {
  return {
    ...report,
    components: report.components.map((part) =>
      part.component === "Report" ? { ...part, sources: [...sources] } : part,
    ),
  }
}

const citationKinds = (report: ReportDraft) =>
  reportViolations(report).map((violation) => violation.kind)

describe("出典の照らし合わせ", () => {
  it("置ける欄の全部に印があり、全部の出典が指されていれば何も出ない", () => {
    expect(citationKinds(withSources(draft(CITED_EVERYWHERE), [S1, S2, S3, S4]))).toEqual([])
  })

  it("sources に無い id を指すと unknown-cite で、指した id を持つ", () => {
    const report = withSources(draft([reportDraftText("架空{{cite: s1 s9}}。")]), [S1])
    expect(reportViolations(report)).toEqual([{ kind: "unknown-cite", count: 1, ids: ["s9"] }])
  })

  it("どこからも指されない出典は uncited-source", () => {
    const report = withSources(draft([reportDraftText("架空{{cite: s1}}。")]), [S1, S2])
    expect(reportViolations(report)).toEqual([{ kind: "uncited-source", count: 1, ids: ["s2"] }])
  })

  it("同じ id が2回あると duplicate-source-id", () => {
    const report = withSources(draft([reportDraftText("架空{{cite: s1}}。")]), [
      S1,
      { ...S1, url: "https://example.com/other" },
    ])
    expect(reportViolations(report)).toEqual([
      { kind: "duplicate-source-id", count: 1, ids: ["s1"] },
    ])
  })

  it("末尾の / と # 以降だけ違う URL は duplicate-source-url", () => {
    const report = withSources(draft([reportDraftText("架空{{cite: s1 s2}}。")]), [
      S1,
      { ...S2, url: `${S1.url}/#part` },
    ])
    expect(reportViolations(report)).toEqual([
      { kind: "duplicate-source-url", count: 1, ids: ["s2"] },
    ])
  })

  it("結論と見出しの印は misplaced-cite で、置ける欄の印は数えない", () => {
    const report = withSources(
      draft([reportDraftText("架空{{cite: s1}}。")], "架空の結論{{cite: s1}}。", [
        {
          heading: "架空のセクション{{cite: s1}}",
          blocks: [reportDraftText("架空{{cite: s1}}。")],
        },
      ]),
      [S1],
    )
    expect(reportViolations(report)).toEqual([{ kind: "misplaced-cite", count: 2 }])
  })

  it("部品の例の Report は出典の差し戻しに掛からない", () => {
    const components = PART_EXAMPLES.Report.map((part) => a2uiReportComponentSchema.parse(part))
    const report = { ...draft([]), components }

    expect(reportViolations(report).filter(isCitationViolation)).toEqual([])
  })

  it("差し戻しの文に本文と出典の題・URL の字を写さない", () => {
    const report = withSources(
      draft([reportDraftText("架空の秘密の文{{cite: s9}}。")], "架空の秘密の結論{{cite: s1}}。"),
      [S1, { ...S2, url: S1.url }],
    )
    const text = reportRejectionText(reportViolations(report))

    expect(text).toContain("s9")
    expect(text).not.toContain("秘密")
    expect(text).not.toContain("架空の出典")
    expect(text).not.toContain("example.com")
  })
})
