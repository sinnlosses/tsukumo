import { describe, expect, it } from "vitest"

import { workflowHandOf } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/workflow-agent-hand.ts"
import type { TurnStep } from "../../../../../../../../src/shared/session/turn-step.ts"
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

    expect(workflowHandOf(run, NONE, 6000, []).hand?.owner).toEqual({ kind: "agent", index: 1 })
  })

  it("走っているエージェントが無ければ、最後に終わったものを出す", () => {
    const run = runOf([
      agent(0, { state: "done", startedAt: 1000, durationMs: 500 }),
      agent(1, { state: "done", startedAt: 1000, durationMs: 900 }),
    ])

    expect(workflowHandOf(run, NONE, 6000, []).hand?.owner).toEqual({ kind: "agent", index: 1 })
  })

  it("選んだ箱が優先で、種類が無ければ「既定のエージェント」と言う", () => {
    const run = runOf([agent(0, { state: "done", startedAt: 1000, durationMs: 500 }), agent(1, {})])

    const { hand } = workflowHandOf(run, { kind: "agent", taskId: TASK_ID, index: 0 }, 6000, [])

    expect(hand).toMatchObject({
      owner: { kind: "agent", index: 0 },
      kind: "既定のエージェント",
      model: "",
    })
  })

  it("選んでいないときの手元は自動の選択（chosen が偽）で、選んだときだけ真になる", () => {
    const run = runOf([agent(0, { state: "done", startedAt: 1000, durationMs: 500 })])

    expect(workflowHandOf(run, NONE, 6000, []).hand?.chosen).toBe(false)
    expect(
      workflowHandOf(run, { kind: "agent", taskId: TASK_ID, index: 0 }, 6000, []).hand?.chosen,
    ).toBe(true)
  })

  it("着手の箱を選ぶと、メインの着手の手順を手元に出す", () => {
    const run = runOf([agent(0, {})])
    const prelude: TurnStep = {
      toolUseId: "main-1",
      name: "Bash",
      input: { command: "tw claim" },
      nested: false,
      startedAt: { kind: "stamped", at: 1000 },
      status: { kind: "done", finishedAt: { kind: "stamped", at: 3000 } },
      backgroundEnd: { kind: "foreground" },
      phase: { kind: "none" },
    }

    const { hand } = workflowHandOf(run, { kind: "prelude", taskId: TASK_ID }, 6000, [prelude])

    expect(hand).toMatchObject({
      owner: { kind: "prelude" },
      chosen: true,
      state: "done",
      name: "着手",
      kind: "メイン",
      total: 1,
      steps: [{ key: "main-1", state: "done", tool: "Bash", elapsed: "2秒" }],
    })
  })

  it("着手の手順が無ければ、着手の箱を選んでいてもエージェントを出す", () => {
    const run = runOf([agent(0, {})])

    expect(workflowHandOf(run, { kind: "prelude", taskId: TASK_ID }, 6000, []).hand?.owner).toEqual(
      { kind: "agent", index: 0 },
    )
  })

  it("エージェントがいなければ手元を持たない", () => {
    expect(workflowHandOf(runOf([]), NONE, 0, [])).toEqual({})
  })
})
