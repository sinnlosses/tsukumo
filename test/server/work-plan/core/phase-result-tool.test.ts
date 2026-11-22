import { describe, expect, it } from "vitest"

import { createCallReview } from "../../../../src/server/session-driver/core/call-review.ts"
import {
  answerPhaseResultCall,
  judgePhaseResultCaller,
} from "../../../../src/server/work-plan/core/phase-result-tool.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { requestEvent } from "../../../fixture/session-event.ts"

const PHASES = ["架空の計画", "架空の実装A", "架空の実装B", "架空の受け入れ"]

function plannedReview() {
  const review = createCallReview()
  review.pass(requestEvent())
  review.judgeWorkPlan({
    phases: PHASES,
    current: 1,
    phaseSummary: "架空のまとめ。",
    delegatedRange: { first: 1, count: 2 },
  })
  return review
}

describe("answerPhaseResultCall", () => {
  it("帯を動かしたときだけ、結果を読んだ返却を流す", () => {
    const review = plannedReview()
    const events: SessionEvent[] = []

    const moved = answerPhaseResultCall(
      review,
      { phase: 1, count: 2, outcome: "finished" },
      (event) => events.push(event),
    )
    const unmoved = answerPhaseResultCall(
      review,
      { phase: 1, count: 2, outcome: "finished" },
      (event) => events.push(event),
    )

    expect(moved.text.startsWith("ok\nプログレスバーの今のフェーズは 本 2/2")).toBe(true)
    expect(
      unmoved.text.startsWith(
        "ok\nプログレスバーは動いていない。プログレスバーの今のフェーズは 本 2/2",
      ),
    ).toBe(true)
    expect(events).toEqual([
      {
        kind: "delegate-returned",
        handback: {
          kind: "phase-done",
          position: { kind: "numbered", phase: 1, count: 2 },
          summary: "",
        },
      },
    ])
  })

  it("形の誤りは差し戻しの文を返し、何も流さない", () => {
    const events: SessionEvent[] = []

    expect(
      answerPhaseResultCall(plannedReview(), { phase: 0, count: 2, outcome: "finished" }, (event) =>
        events.push(event),
      ),
    ).toEqual({
      text: expect.stringContaining("phase と count は両方渡すか両方省き"),
      isError: true,
    })
    expect(events).toEqual([])
  })

  it("段の id を持つワークプランでは、戻り・飛ばしの申告を差し戻して帯を動かさず、今の段の申告は進める", () => {
    const review = createCallReview()
    review.pass(requestEvent())
    review.judgeWorkPlan({
      phases: PHASES.map((name, index) => ({ id: `架空のid${String(index)}`, name })),
      current: 1,
      phaseSummary: "架空のまとめ。",
      delegatedRange: { first: 1, count: 2 },
    })
    const events: SessionEvent[] = []
    const answer = (phase: number) =>
      answerPhaseResultCall(review, { phase, count: 2, outcome: "finished" }, (event) =>
        events.push(event),
      )
    const OUT_OF_ORDER = {
      text: expect.stringContaining(
        "済んだフェーズへの戻りと、先のフェーズへの飛ばしは受け付けない",
      ),
      isError: true,
    }

    expect(answer(2)).toEqual(OUT_OF_ORDER)
    expect(events).toEqual([])
    expect(answer(1).text.startsWith("ok\nプログレスバーの今のフェーズは 本 2/2")).toBe(true)
    expect(answer(1)).toEqual(OUT_OF_ORDER)
    expect(events).toHaveLength(1)
  })
})

describe("judgePhaseResultCaller", () => {
  const PHASE_RESULT = "mcp__tsukumo__phase_result"
  const phaseOf = (agentId: string) => (agentId === "agent-accept" ? "accept" : undefined)
  const judge = (
    toolName: string,
    agentId: string | undefined,
    toolInput: unknown,
    phaseIds: readonly string[] = ["impl-1", "accept"],
  ) =>
    judgePhaseResultCaller({
      toolName,
      ...(agentId === undefined ? {} : { agentId }),
      toolInput,
      workflowAgentPhase: phaseOf,
      phaseIds,
    })
  const ALLOW = { kind: "allow" }

  it("メインの phase_result だけを拒み、ほかのツールは通す", () => {
    expect(judge(PHASE_RESULT, undefined, { outcome: "finished" })).toEqual({
      kind: "deny",
      reason: expect.stringContaining(
        "phase_result は委譲先がフェーズの結果を返すツールで、メインは呼ばない",
      ),
    })
    expect(judge("mcp__tsukumo__work_plan", undefined, {})).toEqual(ALLOW)
  })

  it("agent の段が phaseIds にあり step も phase も無い呼び出しは、その段を step に足して差し替える", () => {
    expect(judge(PHASE_RESULT, "agent-accept", { outcome: "finished", summary: "架空" })).toEqual({
      kind: "rewrite",
      input: { outcome: "finished", summary: "架空", step: "accept" },
    })
  })

  it.each([
    ["phase がある", "agent-accept", { phase: 1, count: 2, outcome: "finished" }, undefined],
    ["step がある", "agent-accept", { step: "impl-1", outcome: "finished" }, undefined],
    ["agent の段が phaseIds に無い", "agent-accept", { outcome: "finished" }, ["impl-1"]],
    ["agent が写しに無い", "agent-other", { outcome: "finished" }, undefined],
  ])("%s 呼び出しは差し替えずに通す", (_, agentId, toolInput, phaseIds) => {
    expect(judge(PHASE_RESULT, agentId, toolInput, phaseIds)).toEqual(ALLOW)
  })
})
