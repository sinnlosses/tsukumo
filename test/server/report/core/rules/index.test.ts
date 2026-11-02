import { describe, expect, it } from "vitest"

import { isBlockViolation } from "../../../../../src/server/report/core/rules/block.ts"
import { isCheckViolation } from "../../../../../src/server/report/core/rules/check.ts"
import type { ReportDraft } from "../../../../../src/server/report/core/rules/draft.ts"
import { isFigureViolation } from "../../../../../src/server/report/core/rules/figure.ts"
import {
  REPORT_VIOLATION_KINDS,
  reportViolations,
} from "../../../../../src/server/report/core/rules/index.ts"
import { isProseViolation } from "../../../../../src/server/report/core/rules/prose.ts"
import { isTemplateViolation } from "../../../../../src/server/report/core/rules/template.ts"
import {
  draft,
  kinds,
  mermaid,
  note,
  reportDraftText,
} from "../../../../fixture/report-draft-block.ts"

describe("違反の種類の持ち主", () => {
  it("全部の種類が、ちょうど 1 つの家族に持たれる", () => {
    const owners = [
      isProseViolation,
      isBlockViolation,
      isFigureViolation,
      isCheckViolation,
      isTemplateViolation,
    ]

    expect(
      REPORT_VIOLATION_KINDS.filter((kind) => owners.filter((owns) => owns({ kind })).length !== 1),
    ).toEqual([])
  })
})

describe("reportViolations の並び", () => {
  it("文章・塊・図・checks・雛形の順に違反が並ぶ", () => {
    const base = draft(
      [reportDraftText("架空。"), note(), note(), note(), mermaid("flowchart TD\nA --> B")],
      ["架空の 3 件が 2 層で 5 分遅い。", "二つ目。", "三つ目。"],
    )
    const report: ReportDraft = {
      ...base,
      checks: [
        {
          status: "unobserved",
          label: "架空の確認",
          figure: "",
          command: "",
          detail: "",
          howToVerify: "",
        },
      ],
      task: {
        kind: "task",
        id: "T-1",
        name: "架空の作業",
        outcome: "finished",
        genre: "diagnosis",
      },
    }

    expect(kinds(report)).toEqual([
      "long-conclusion",
      "too-many-notes",
      "unknown-mermaid",
      "unobserved-without-how",
      "template-miss",
    ])
    expect(reportViolations(report).length).toBe(5)
  })
})
