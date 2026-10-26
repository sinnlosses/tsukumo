import { describe, expect, it } from "vitest"

import { REPORT_REJECTION_MODES } from "../../../../src/server/report/core/rejection-mode.ts"
import { reportDraft, reportEvent } from "../../../fixture/report-event.ts"
import { createReportReview, noPlan } from "../../../fixture/report-review.ts"

const COUNTED_REASONS = [
  "long-first-sentence",
  "sentence-table",
  "figure-contradiction",
  "long-table",
  "long-list",
  "untitled-section",
  "crowded-notes",
  "many-emphasis-rows",
] as const

describe("本番の表で数えるだけの条", () => {
  it("字数や体裁の条（長い1文目・文の表・長い表と一覧・題の無い節・多い注・強調の行・図の理由の矛盾）は数えるだけの段にある", () => {
    expect(COUNTED_REASONS.map((reason) => REPORT_REJECTION_MODES[reason])).toEqual(
      COUNTED_REASONS.map(() => "count"),
    )
  })

  it("figure の理由と本文の矛盾は差し戻さず通し、描いた report の後ろに条の名前を記録する", () => {
    const review = createReportReview(noPlan)
    const section = (heading: string) =>
      ({
        heading,
        shapeTag: "unspecified",
        blocks: [{ kind: "text", text: "架空の根拠。", fold: "", aside: "" }],
      }) as const
    const contradicting = reportDraft({
      conclusion: "架空の結論。",
      figure: { kind: "none", reason: "short-answer" },
      sections: [section("架空の節1"), section("架空の節2")],
    })

    expect(review.judge(contradicting)).toEqual({ kind: "accepted" })
    review.pass(
      reportEvent({
        toolUseId: "toolu_c1",
        conclusion: contradicting.conclusion,
        figure: contradicting.figure,
        sections: contradicting.sections,
        favor: contradicting.favor,
        checks: contradicting.checks,
        workPlanClosing: contradicting.workPlanClosing,
      }),
    )
    const passed = review.pass({
      kind: "tool-finished",
      toolUseId: "toolu_c1",
      content: "ok",
      isError: false,
    })

    expect(passed.at(-1)).toMatchObject({
      kind: "report-counted",
      reasons: ["figure-contradiction"],
    })
  })
})
