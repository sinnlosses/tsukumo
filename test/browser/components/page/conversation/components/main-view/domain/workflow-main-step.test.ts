import { describe, expect, it } from "vitest"

import { workflowMainStepEndsOf } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/workflow-main-step.ts"
import type { TurnStep } from "../../../../../../../../src/shared/session/turn-step.ts"

function step(
  id: string,
  name: string,
  startedAt: number,
  finishedAt: number,
  nested = false,
  phaseIndex?: number,
): TurnStep {
  return {
    toolUseId: id,
    name,
    input: {},
    nested,
    startedAt: { kind: "stamped", at: startedAt },
    status: { kind: "done", finishedAt: { kind: "stamped", at: finishedAt } },
    backgroundEnd: { kind: "foreground" },
    phase:
      phaseIndex === undefined
        ? { kind: "none" }
        : {
            kind: "phase",
            indexes: [phaseIndex],
            count: 5,
            name: "段",
            range: { kind: "range", first: 1, count: 3 },
          },
  }
}

describe("workflowMainStepEndsOf", () => {
  it("2本目の着手を1本目の呼び出しのあとから数え、送り出しは最後の1本だけが持つ", () => {
    const steps = [
      step("a", "Bash", 0, 1000),
      step("b", "Workflow", 1000, 1500),
      step("inner", "Read", 1200, 1300, true),
      step("c", "Bash", 2000, 4000),
      step("d", "Bash", 4000, 5000),
      step("e", "Workflow", 5000, 5100),
      step("w", "Bash", 5200, 5900, false, 2),
      step("f", "Bash", 6000, 9000, false, 4),
    ]
    const [first, second] = workflowMainStepEndsOf(steps, 2, 4)
    expect(first?.prelude).toEqual({ count: 2, duration: { kind: "known", milliseconds: 1500 } })
    expect(first?.landing.count).toBe(0)
    expect(second?.prelude).toEqual({ count: 3, duration: { kind: "known", milliseconds: 3100 } })
    expect(second?.landing).toEqual({ count: 1, duration: { kind: "known", milliseconds: 3000 } })
  })

  it("範囲の後ろの段が無ければ、呼び出しのあとの手順があっても送り出しは無い", () => {
    const steps = [step("b", "Workflow", 0, 10), step("w", "Bash", 20, 30, false, 2)]
    const [only] = workflowMainStepEndsOf(steps, 1)
    expect(only?.landing.count).toBe(0)
  })

  it("呼び出しが見つからないスクリプトは両端とも手順が無い", () => {
    const [only] = workflowMainStepEndsOf([step("a", "Bash", 0, 10)], 1)
    expect(only?.prelude.count).toBe(0)
    expect(only?.landing.count).toBe(0)
  })
})
