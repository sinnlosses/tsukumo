import { describe, expect, it } from "vitest"

import type { ReportDraft } from "../../../../../src/server/report/core/rules/draft.ts"
import type { ReportTask, ReportTaskOutcome } from "../../../../../src/shared/report/report-task.ts"
import type { SessionEvent } from "../../../../../src/shared/session/session-event.ts"
import type {
  WorkPlanClosing,
  WorkPlanStanding,
} from "../../../../../src/shared/session/work-plan.ts"
import { reportEvent } from "../../../../fixture/report-event.ts"
import {
  createReportReview,
  FINISHED,
  INVALID,
  noPlan,
  REJECTION_PHRASE,
  SESSION_INFO,
  VALID,
} from "../../../../fixture/report-review.ts"
import { checkedToolUseId } from "../../../../fixture/tool-use-id.ts"

const MISSING_WORK_PLAN_CLOSING_TEXT = expect.stringContaining(
  REJECTION_PHRASE.missingWorkPlanClosing,
)
const UNFINISHED_PHASES_TEXT = expect.stringContaining(REJECTION_PHRASE.unfinishedPhases)

describe("createReportReview の judge（ワークプランの残った report）", () => {
  const taskOf = (outcome: ReportTaskOutcome): ReportTask => ({
    kind: "task",
    id: "架空のタスク",
    name: "架空の作業",
    outcome,
    genre: "work",
  })
  const withTask = (outcome: ReportTaskOutcome, workPlanClosing: WorkPlanClosing): ReportDraft => ({
    ...VALID,
    task: taskOf(outcome),
    workPlanClosing,
  })
  const closing = (workPlanClosing: WorkPlanClosing): ReportDraft => ({ ...VALID, workPlanClosing })
  /** 立ち位置を差し替えられる `ReportReview`。 */
  const reviewWith = (initial: WorkPlanStanding) => {
    let standing = initial
    return {
      review: createReportReview(() => standing),
      moveTo: (next: WorkPlanStanding) => {
        standing = next
      },
    }
  }

  it("応えていない work_plan の差し戻しがあれば差し戻し、応えたあとなら通す", () => {
    const { review, moveTo } = reviewWith({ kind: "rejected" })

    expect(review.judge(VALID)).toEqual({
      kind: "rejected",
      text: expect.stringContaining(REJECTION_PHRASE.unansweredWorkPlan),
      reasons: ["unanswered-work-plan"],
    })
    moveTo({ kind: "planned", remaining: 1 })
    expect(review.judge(closing("finished"))).toEqual({ kind: "accepted" })
  })

  it("ワークプランがあってフェーズの閉じ方の欄が無ければ差し戻す（全部済みのあとでも）", () => {
    for (const remaining of [2, 1, 0]) {
      expect(reviewWith({ kind: "planned", remaining }).review.judge(VALID)).toEqual({
        kind: "rejected",
        text: MISSING_WORK_PLAN_CLOSING_TEXT,
        reasons: ["missing-work-plan-closing"],
      })
    }
  })

  it("ワークプランの無い依頼では、欄が無くてもあっても通す", () => {
    for (const workPlanClosing of ["none", "finished", "stopped"] as const) {
      expect(createReportReview(noPlan).judge(closing(workPlanClosing))).toEqual({
        kind: "accepted",
      })
    }
  })

  it("finished で段が2つ以上残っていれば差し戻し、最後の段か全部済みなら通す", () => {
    expect(reviewWith({ kind: "planned", remaining: 2 }).review.judge(closing("finished"))).toEqual(
      {
        kind: "rejected",
        text: UNFINISHED_PHASES_TEXT,
        reasons: ["unfinished-phases"],
      },
    )
    for (const remaining of [1, 0]) {
      expect(reviewWith({ kind: "planned", remaining }).review.judge(closing("finished"))).toEqual({
        kind: "accepted",
      })
    }
  })

  it("stopped は段が残っていても通す（タスクが stopped・awaiting-answer でも、タスクが無くても）", () => {
    const { review } = reviewWith({ kind: "planned", remaining: 2 })

    expect(review.judge(closing("stopped"))).toEqual({ kind: "accepted" })
    expect(review.judge(withTask("stopped", "stopped"))).toEqual({ kind: "accepted" })
    expect(review.judge(withTask("awaiting-answer", "stopped"))).toEqual({ kind: "accepted" })
  })

  it("タスクが finished なのに stopped で段が残っていれば差し戻し、全部済みなら通す", () => {
    expect(
      reviewWith({ kind: "planned", remaining: 1 }).review.judge(withTask("finished", "stopped")),
    ).toEqual({
      kind: "rejected",
      text: expect.stringContaining(REJECTION_PHRASE.finishedButStopped),
      reasons: ["finished-but-stopped"],
    })
    expect(
      reviewWith({ kind: "planned", remaining: 0 }).review.judge(withTask("finished", "stopped")),
    ).toEqual({ kind: "accepted" })
    expect(
      reviewWith({ kind: "planned", remaining: 1 }).review.judge(withTask("finished", "finished")),
    ).toEqual({ kind: "accepted" })
  })

  it("フェーズの閉じ方の枠は1ターンに1回で、規約違反の枠とは別に数え、次のターンで戻る", () => {
    const { review } = reviewWith({ kind: "planned", remaining: 2 })

    expect(review.judge(INVALID)).toEqual({
      kind: "rejected",
      text: MISSING_WORK_PLAN_CLOSING_TEXT,
      reasons: ["missing-work-plan-closing"],
    })
    expect(review.judge({ ...INVALID, workPlanClosing: "finished" }).kind).toBe("rejected")
    expect(review.judge({ ...INVALID, workPlanClosing: "finished" })).toEqual({
      kind: "accepted",
    })
    ;[FINISHED, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(closing("finished"))).toEqual({
      kind: "rejected",
      text: UNFINISHED_PHASES_TEXT,
      reasons: ["unfinished-phases"],
    })
  })

  it("補足メッセージのターンでは、ワークプランがあってもフェーズの閉じ方の欄が無いことで差し戻さず、ターンが終われば戻る", () => {
    const { review } = reviewWith({ kind: "planned", remaining: 2 })
    const aside: SessionEvent = { kind: "aside", text: "架空の問い", images: [] }

    ;[aside, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge(VALID)).toEqual({ kind: "accepted" })

    ;[FINISHED, SESSION_INFO].forEach((event) => review.pass(event))
    expect(review.judge({ ...VALID, conclusion: "架空の別の結論。" })).toEqual({
      kind: "rejected",
      text: MISSING_WORK_PLAN_CLOSING_TEXT,
      reasons: ["missing-work-plan-closing"],
    })
  })

  describe("作業のターンに補足メッセージが届いたとき", () => {
    const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
    const aside: SessionEvent = { kind: "aside", text: "架空の問い", images: [] }
    const resumed: SessionEvent = { kind: "turn-resumed" }
    const speech: SessionEvent = { kind: "speech", text: "架空の答え", expression: "default" }
    const missingClosing = {
      kind: "rejected",
      text: MISSING_WORK_PLAN_CLOSING_TEXT,
      reasons: ["missing-work-plan-closing"],
    }

    it("別のターンで答えるなら、作業のターンはフェーズの閉じ方を求め、続きのターンは求めない", () => {
      const { review } = reviewWith({ kind: "planned", remaining: 2 })

      ;[request, SESSION_INFO, aside].forEach((event) => review.pass(event))
      expect(review.judge(VALID)).toEqual(missingClosing)

      ;[FINISHED, resumed, SESSION_INFO, speech].forEach((event) => review.pass(event))
      expect(review.judge({ ...VALID, conclusion: "架空の別の結論。" })).toEqual({
        kind: "accepted",
      })
    })

    it("作業のターンが report と締めのセリフで閉じたあとの続きのターンも、補足のターンとして読む", () => {
      const { review } = reviewWith({ kind: "planned", remaining: 2 })
      const toolUseId = checkedToolUseId("toolu_work")
      const report = reportEvent({
        toolUseId,
        closing: { kind: "speech", text: "架空の締め", expression: "default" },
      })
      const reportResult: SessionEvent = {
        kind: "tool-finished",
        toolUseId,
        content: "ok",
        isError: false,
      }

      ;[
        request,
        SESSION_INFO,
        aside,
        report,
        reportResult,
        FINISHED,
        resumed,
        SESSION_INFO,
      ].forEach((event) => review.pass(event))
      review.raiseNews()
      expect(review.judge({ ...VALID, conclusion: "架空の別の結論。" })).toEqual({
        kind: "accepted",
      })
    })

    it("取り込まれて答えたなら、作業のターンはフェーズの閉じ方を求め、続きのターンも補足にならない", () => {
      const { review } = reviewWith({ kind: "planned", remaining: 2 })

      ;[request, SESSION_INFO, aside, speech].forEach((event) => review.pass(event))
      expect(review.judge(VALID)).toEqual(missingClosing)

      ;[FINISHED, resumed, SESSION_INFO].forEach((event) => review.pass(event))
      expect(review.judge({ ...VALID, conclusion: "架空の別の結論。" })).toEqual(missingClosing)
    })
  })
})
