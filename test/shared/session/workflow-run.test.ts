import { describe, expect, it } from "vitest"

import type { BackgroundTask } from "../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import type { WorkflowAgent } from "../../../src/shared/session/workflow-step.ts"
import { checkedTaskId } from "../../fixture/task-id.ts"
import { checkedToolUseId } from "../../fixture/tool-use-id.ts"

const WORKFLOW = {
  taskId: checkedTaskId("wf-1"),
  kind: "workflow",
  description: "架空の流れ",
} satisfies BackgroundTask

const tasksChanged = (...tasks: readonly BackgroundTask[]): SessionEvent => ({
  kind: "background-tasks-changed",
  tasks,
})
const progressOf = (...agents: readonly WorkflowAgent[]): SessionEvent => ({
  kind: "workflow-progress",
  progress: { taskId: WORKFLOW.taskId, phases: [], agents },
})
const agent = (overrides: Partial<WorkflowAgent> = {}): WorkflowAgent => ({
  index: 0,
  agentId: "agent-1",
  state: "progress",
  phaseTitle: "架空の段",
  ...overrides,
})
const stepStarted = (toolUseId: string, agentId = "agent-1"): SessionEvent => ({
  kind: "workflow-step-started",
  agentId,
  toolUseId: checkedToolUseId(toolUseId),
  name: "Bash",
  input: { command: "架空のコマンド" },
})
const stepFinished = (toolUseId: string, failed: boolean): SessionEvent => ({
  kind: "workflow-step-finished",
  agentId: "agent-1",
  toolUseId: checkedToolUseId(toolUseId),
  failed,
})
const request: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }

/** 1件目を時刻 1、以降を 1 ずつ進めて畳む。 */
function applyTimed(...events: readonly SessionEvent[]): SessionState {
  return events.reduce(
    (state, event, index) => applySessionEvent(state, event, index + 1),
    INITIAL_SESSION_STATE,
  )
}

function agentsOf(state: SessionState) {
  return state.workflowRuns.flatMap((run) => run.agents)
}

describe("applySessionEvent（ワークフロースクリプトの図の材料）", () => {
  it("種類・名札は新しい行に無ければ前の値を残し、ほかの欄は新しい行の値にする", () => {
    const state = applyTimed(
      tasksChanged(WORKFLOW),
      progressOf(agent({ label: "架空の名札", agentType: "架空の種類", model: "架空のモデル" })),
      progressOf(agent({ state: "done", durationMs: 5 })),
    )

    expect(
      agentsOf(state).map(({ label, agentType, model, state: agentState, durationMs }) => ({
        label,
        agentType,
        model,
        state: agentState,
        durationMs,
      })),
    ).toEqual([
      {
        label: "架空の名札",
        agentType: "架空の種類",
        model: undefined,
        state: "done",
        durationMs: 5,
      },
    ])
  })

  it("queuedAt は前の値と小さいほうを残し、写しから消えたエージェントも残す", () => {
    const state = applyTimed(
      tasksChanged(WORKFLOW),
      progressOf(agent({ queuedAt: 100 }), agent({ index: 1, agentId: "agent-2" })),
      progressOf(agent({ queuedAt: 300 })),
    )

    expect(agentsOf(state).map((each) => [each.index, each.queuedAt])).toEqual([
      [0, 100],
      [1, undefined],
    ])
  })

  it("agentId の無い待ちのエージェントもインスタンスとして持つ", () => {
    const state = applyTimed(
      tasksChanged(WORKFLOW),
      progressOf({ index: 0, state: "start", phaseTitle: "", queuedAt: 1 }),
    )

    expect(agentsOf(state)).toEqual([
      expect.objectContaining({ index: 0, steps: [], stepCount: 0 }),
    ])
  })

  it("21 件目で古い手順が落ち、始まった手順の総数は 21 になる", () => {
    const starts = Array.from({ length: 21 }, (_, index) => stepStarted(`tu-${String(index)}`))
    const state = applyTimed(tasksChanged(WORKFLOW), progressOf(agent()), ...starts)
    const [only] = agentsOf(state)

    expect(only?.stepCount).toBe(21)
    expect(only?.steps.map((step) => step.toolUseId)).toEqual(
      Array.from({ length: 20 }, (_, index) => `tu-${String(index + 1)}`),
    )
  })

  it("手順の終わりに時刻と失敗したかを付け、done になったエージェントの走っている手順も終わりにする", () => {
    const state = applyTimed(
      tasksChanged(WORKFLOW),
      progressOf(agent()),
      stepStarted("tu-ok"),
      stepFinished("tu-ok", false),
      stepStarted("tu-ng"),
      stepFinished("tu-ng", true),
      stepStarted("tu-open"),
      progressOf(agent({ state: "done" })),
    )

    expect(agentsOf(state)[0]?.steps).toEqual([
      expect.objectContaining({ toolUseId: "tu-ok", startedAt: 3, finishedAt: 4, failed: false }),
      expect.objectContaining({ toolUseId: "tu-ng", startedAt: 5, finishedAt: 6, failed: true }),
      expect.objectContaining({ toolUseId: "tu-open", startedAt: 7, finishedAt: 8, failed: false }),
    ])
  })

  it("顔ぶれから外れても捨てずに終わった印を付け、aside では残り、request で捨てる", () => {
    const ended = applyTimed(tasksChanged(WORKFLOW), progressOf(agent()), tasksChanged())

    expect(ended.workflowRuns.map((run) => run.ended)).toEqual([true])
    expect(ended.workflowProgress).toEqual([])
    const afterAside = applySessionEvent(
      ended,
      { kind: "aside", text: "架空の脇道", images: [] },
      10,
    )
    expect(afterAside.workflowRuns).toHaveLength(1)
    expect(applySessionEvent(afterAside, request, 11).workflowRuns).toEqual([])
  })

  it("走っているワークフロースクリプトは request で残る", () => {
    const state = applyTimed(tasksChanged(WORKFLOW), progressOf(agent()), request)

    expect(state.workflowRuns.map((run) => [run.taskId, run.ended])).toEqual([["wf-1", false]])
  })

  it("顔ぶれに無いワークフロースクリプトの写しは受けず、session-ended で空になる", () => {
    expect(applyTimed(progressOf(agent())).workflowRuns).toEqual([])
    expect(
      applyTimed(tasksChanged(WORKFLOW), progressOf(agent()), {
        kind: "session-ended",
        reason: "架空の終わり",
      }).workflowRuns,
    ).toEqual([])
  })
})
