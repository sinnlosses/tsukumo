import { describe, expect, it } from "vitest"

import {
  answerPhaseResultCall,
  judgePhaseResultCaller,
} from "../../../../src/server/work-plan/core/phase-result-tool.ts"
import { createWorkPlanReview } from "../../../../src/server/work-plan/core/work-plan-review.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { checkedTaskId } from "../../../fixture/task-id.ts"
import { REQUEST, SUMMARY } from "../../../fixture/work-plan-review.ts"

describe("WorkPlanReview の段の id で返す phase_result", () => {
  const IDENTIFIED = [
    { id: "plan", name: "架空の計画" },
    { id: "impl-1", name: "架空の実装A" },
    { id: "impl-2", name: "架空の実装B" },
    { id: "accept", name: "架空の受け入れ" },
    { id: "retrospect", name: "架空の振り返り" },
  ]
  const at = (current: number) => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge({ phases: IDENTIFIED, current: 0, delegatedRange: { first: 1, count: 2 } })
    for (let next = 2; next <= current; next += 1) {
      expect(
        review.judge({
          phases: IDENTIFIED,
          current: next,
          phaseSummary: SUMMARY,
          delegatedRange: { first: 1, count: 2 },
        }).kind,
      ).toBe("accepted")
    }
    return review
  }
  const currentOf = (review: ReturnType<typeof createWorkPlanReview>) => {
    const plan = review.latestPlan()
    return plan.kind === "planned" ? plan.current : undefined
  }

  it("step は範囲の外の後ろの群の今の段も済ませる", () => {
    const review = at(3)

    expect(review.judgeResult({ step: "accept", outcome: "finished" })).toMatchObject({
      kind: "accepted",
      moved: true,
    })
    expect(currentOf(review)).toBe(4)
  })

  it("phases の id に無い step は unknown-step で、帯を動かさない", () => {
    const review = at(1)

    expect(review.judgeResult({ step: "架空の無い段", outcome: "finished" }).kind).toBe(
      "unknown-step",
    )
    expect(currentOf(review)).toBe(1)
  })

  it("phase・count だけの呼び出しは、段の id があっても今までどおり範囲の段を済ませる", () => {
    const review = at(1)

    expect(review.judgeResult({ phase: 1, count: 2, outcome: "finished" })).toMatchObject({
      kind: "accepted",
      moved: true,
    })
    expect(currentOf(review)).toBe(2)
  })

  it("フックが step を補った入力なら、1段だけを受け持つ agent の段が phase・count なしで済む", () => {
    const review = createWorkPlanReview()
    review.pass(REQUEST)
    review.judge({ phases: IDENTIFIED, current: 0 })
    review.pass({
      kind: "workflow-progress",
      progress: {
        taskId: checkedTaskId("wf-1"),
        phases: [],
        agents: [{ index: 0, agentId: "agent-accept", state: "start", phaseTitle: "accept" }],
      },
    })
    const plan = review.latestPlan()
    const verdict = judgePhaseResultCaller({
      toolName: "mcp__tsukumo__phase_result",
      agentId: "agent-accept",
      toolInput: { outcome: "finished", summary: "架空の受け入れを済ませた。" },
      workflowAgentPhase: review.workflowAgentPhase,
      phaseIds: plan.kind === "planned" ? plan.phaseIds : [],
    })
    if (verdict.kind !== "rewrite") {
      throw new Error("step を補う呼び出しを渡す")
    }
    const events: SessionEvent[] = []

    const answer = answerPhaseResultCall(
      { judgePhaseResult: review.judgeResult },
      verdict.input,
      (event) => {
        events.push(event)
      },
    )

    expect(answer.isError).toBe(false)
    expect(events).toHaveLength(1)
    expect(currentOf(review)).toBe(4)
  })

  it("今でない段の step は out-of-order で差し戻す", () => {
    const review = at(1)

    expect(review.judgeResult({ step: "impl-2", outcome: "finished" }).kind).toBe("out-of-order")
    expect(review.judgeResult({ step: "plan", outcome: "finished" }).kind).toBe("out-of-order")
    expect(currentOf(review)).toBe(1)
  })
})
