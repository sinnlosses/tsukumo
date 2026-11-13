import { describe, expect, it } from "vitest"

import { REPORT_REJECTION_MODES } from "../../../../../src/server/report/core/rules/rejection-mode.ts"
import {
  type ReportDraftInput,
  reportDraft,
  reportEvent,
} from "../../../../fixture/report-event.ts"
import { createReportReview, noPlan } from "../../../../fixture/report-review.ts"
import { requestEvent } from "../../../../fixture/session-event.ts"
import { checkedToolUseId } from "../../../../fixture/tool-use-id.ts"

const COUNTED_REASONS = [
  "long-first-sentence",
  "sentence-table",
  "figure-contradiction",
  "figure-number-mismatch",
  "plot-forbidden-form",
  "plot-form-override",
  "broken-inline-mark",
  "plot-title-without-number",
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
        components: contradicting.components,
        favor: contradicting.favor,
        checks: contradicting.checks,
        workPlanClosing: contradicting.workPlanClosing,
      }),
    )
    const passed = review.pass({
      kind: "tool-finished",
      toolUseId: checkedToolUseId("toolu_c1"),
      content: "ok",
      isError: false,
    })

    expect(passed.at(-1)).toMatchObject({
      kind: "report-counted",
      reasons: ["figure-contradiction"],
    })
  })
})

describe("判定・出どころ・前回との対応・案内の付箋の条", () => {
  /** 判定して通し、描いた report の後ろに残った数えるだけの条の名前を返す。差し戻したら undefined。 */
  function countedOf(
    review: ReturnType<typeof createReportReview>,
    toolUseId: string,
    overrides: ReportDraftInput,
  ): readonly string[] | undefined {
    const draft = reportDraft({ conclusion: "架空の結論。", ...overrides })
    if (review.judge(draft).kind !== "accepted") {
      return undefined
    }
    review.pass(reportEvent({ toolUseId, conclusion: draft.conclusion }))
    const passed = review.pass({
      kind: "tool-finished",
      toolUseId: checkedToolUseId(toolUseId),
      content: "ok",
      isError: false,
    })
    const counted = passed.find((event) => event.kind === "report-counted")
    return counted?.kind === "report-counted" ? counted.reasons : []
  }
  const PREVIOUS = { kind: "previous", resolved: ["架空"], added: [], remaining: [] } as const
  const textPart = (text: string) =>
    reportDraft({ sections: [{ heading: "架空の節", blocks: [{ kind: "text", text }] }] })
      .components

  it.each([
    [
      "verdict と書いた閉じ方の食い違い",
      "verdict-closing-mismatch",
      { verdict: "done", verdictWritten: true, closingConflict: true },
      { verdict: "done", verdictWritten: true, closingConflict: false },
    ],
    [
      "本文の {{src: n}} と sources の食い違い",
      "source-mismatch",
      { components: textPart("架空の根拠{{src: 2}}。"), sources: [{ mark: 1, place: "a.ts:1" }] },
      { components: textPart("架空の根拠{{src: 1}}。"), sources: [{ mark: 1, place: "a.ts:1" }] },
    ],
    [
      "4つ以上の案内の付箋",
      "guide-note-misplaced",
      {
        guideNotes: ["checks", "conclusion", "favor", "next"].map((target) => ({
          target,
          text: "架空",
        })),
      },
      { guideNotes: [{ target: "checks", text: "架空" }] },
    ],
    [
      "存在しない target の案内の付箋",
      "guide-note-misplaced",
      { guideNotes: [{ target: "架空の部品", text: "架空" }] },
      { guideNotes: [{ target: "conclusion", text: "架空" }] },
    ],
  ] as const)(
    "%s は差し戻さず記録に名前を残し、当たらない入力では残さない",
    (_name, reason, hit, miss) => {
      expect(countedOf(createReportReview(noPlan), "toolu_h", hit)).toContain(reason)
      expect(countedOf(createReportReview(noPlan), "toolu_m", miss)).not.toContain(reason)
    },
  )

  it("前の report を描く前の previous は記録に名前を残し、1度描いたあとは残さない", () => {
    const review = createReportReview(noPlan)

    expect(countedOf(review, "toolu_p1", { previous: PREVIOUS })).toContain(
      "previous-without-earlier-report",
    )
    review.pass(requestEvent())
    review.raiseNews()
    expect(
      countedOf(review, "toolu_p2", { conclusion: "架空の次の結論。", previous: PREVIOUS }),
    ).not.toContain("previous-without-earlier-report")
  })
})
