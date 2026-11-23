import { describe, expect, it } from "vitest"

import { workflowHandOf } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/workflow-agent-hand.ts"
import type {
  WorkflowRun,
  WorkflowRunAgent,
} from "../../../../../../../../src/shared/session/workflow-run.ts"
import { checkedTaskId } from "../../../../../../../fixture/task-id.ts"
import { checkedToolUseId } from "../../../../../../../fixture/tool-use-id.ts"

const TASK_ID = checkedTaskId("wf-hand")
const NONE = { kind: "none" } as const

const agent = (index: number, overrides: Partial<WorkflowRunAgent>): WorkflowRunAgent => ({
  index,
  phaseTitle: "架空の段",
  state: "progress",
  startedAt: 1000,
  steps: [],
  stepCount: 0,
  ...overrides,
})

const runOf = (agents: readonly WorkflowRunAgent[]): WorkflowRun => ({
  taskId: TASK_ID,
  ended: false,
  phases: [],
  agents,
})

describe("workflowHandOf", () => {
  it("選んでいなければ、走っているエージェントのうち最後に手順が始まったものを出す", () => {
    const run = runOf([
      agent(0, { steps: [] }),
      agent(1, {
        steps: [
          {
            toolUseId: checkedToolUseId("tu-1"),
            name: "Read",
            input: {},
            startedAt: 5000,
            failed: false,
          },
        ],
      }),
    ])

    expect(workflowHandOf(run, NONE, 6000).hand?.index).toBe(1)
  })

  it("走っているエージェントが無ければ、最後に終わったものを出す", () => {
    const run = runOf([
      agent(0, { state: "done", startedAt: 1000, durationMs: 500 }),
      agent(1, { state: "done", startedAt: 1000, durationMs: 900 }),
    ])

    expect(workflowHandOf(run, NONE, 6000).hand?.index).toBe(1)
  })

  it("選んだ箱が優先で、種類が無ければ「既定のエージェント」と言う", () => {
    const run = runOf([agent(0, { state: "done", startedAt: 1000, durationMs: 500 }), agent(1, {})])

    const { hand } = workflowHandOf(run, { kind: "agent", taskId: TASK_ID, index: 0 }, 6000)

    expect(hand).toMatchObject({ index: 0, kind: "既定のエージェント", model: "" })
  })

  it("選んでいないときの手元は自動の選択（chosen が偽）で、選んだときだけ真になる", () => {
    const run = runOf([agent(0, { state: "done", startedAt: 1000, durationMs: 500 })])

    expect(workflowHandOf(run, NONE, 6000).hand?.chosen).toBe(false)
    expect(
      workflowHandOf(run, { kind: "agent", taskId: TASK_ID, index: 0 }, 6000).hand?.chosen,
    ).toBe(true)
  })

  it("エージェントがいなければ手元を持たない", () => {
    expect(workflowHandOf(runOf([]), NONE, 0)).toEqual({})
  })
})
