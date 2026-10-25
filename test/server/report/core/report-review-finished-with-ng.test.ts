import { describe, expect, it } from "vitest"

import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import type { ReportTaskOutcome } from "../../../../src/shared/report/report-task.ts"
import { reportDraft } from "../../../fixture/report-event.ts"
import {
  createReportReview,
  noPlan,
  REJECTION_PHRASE,
  SESSION_INFO,
} from "../../../fixture/report-review.ts"

describe("createReportReview の judge（ng の確認がある finished の report）", () => {
  const check = (status: "ok" | "ng" | "unobserved") => ({
    status,
    label: "架空の確認",
    figure: "",
    command: "",
    detail: "",
    howToVerify: status === "unobserved" ? "架空の確かめ方を見る" : "",
  })
  const withTask = (
    outcome: ReportTaskOutcome,
    statuses: readonly ("ok" | "ng" | "unobserved")[],
  ): ReportDraft =>
    reportDraft({
      conclusion: "架空の結論。",
      task: { kind: "task", id: "架空のタスク", name: "架空の作業", outcome, genre: "work" },
      checks: statuses.map(check),
    })

  it("ng の行がある finished は、固定の文面で差し戻す", () => {
    const verdict = createReportReview(noPlan).judge(withTask("finished", ["ok", "ng"]))

    expect(verdict).toEqual({
      kind: "rejected",
      text: expect.stringContaining(REJECTION_PHRASE.finishedWithNg),
      reasons: ["finished-with-ng"],
    })
    expect(verdict.kind === "rejected" ? verdict.text : "").not.toContain("架空")
  })

  it("ng の行があっても、stopped・awaiting-answer・タスクの無い report は通す", () => {
    for (const outcome of ["stopped", "awaiting-answer"] as const) {
      expect(createReportReview(noPlan).judge(withTask(outcome, ["ng"]))).toEqual({
        kind: "accepted",
      })
    }
    expect(
      createReportReview(noPlan).judge(
        reportDraft({ conclusion: "架空の結論。", checks: [check("ng")] }),
      ),
    ).toEqual({ kind: "accepted" })
  })

  it("ng の行が無い finished は通す", () => {
    expect(createReportReview(noPlan).judge(withTask("finished", ["ok", "unobserved"]))).toEqual({
      kind: "accepted",
    })
    expect(createReportReview(noPlan).judge(withTask("finished", []))).toEqual({
      kind: "accepted",
    })
  })

  it("同じターンの2回目は通し、次のターンで枠が戻る", () => {
    const review = createReportReview(noPlan)
    const draft = withTask("finished", ["ng"])

    expect(review.judge(draft).kind).toBe("rejected")
    expect(review.judge(draft)).toEqual({ kind: "accepted" })
    review.pass(SESSION_INFO)
    expect(review.judge(draft)).toMatchObject({ reasons: ["finished-with-ng"] })
  })

  it("脇の話のターンでも差し戻す", () => {
    const review = createReportReview(noPlan)
    review.pass({ kind: "aside", text: "架空の問い", images: [] })

    expect(review.judge(withTask("finished", ["ng"]))).toMatchObject({
      reasons: ["finished-with-ng"],
    })
  })

  it("段の閉じ方の差し戻しが先で、ng の差し戻しはそのあと（枠は別に数える）", () => {
    const review = createReportReview(() => ({ kind: "planned", remaining: 1 }))
    const draft = { ...withTask("finished", ["ng"]), workPlanClosing: "stopped" as const }

    expect(review.judge(draft)).toMatchObject({ reasons: ["finished-but-stopped"] })
    expect(review.judge(draft)).toMatchObject({ reasons: ["finished-with-ng"] })
    expect(review.judge(draft)).toEqual({ kind: "accepted" })
  })
})
