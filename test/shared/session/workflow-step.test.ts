import { describe, expect, it } from "vitest"

import type { BackgroundTask } from "../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import type { WorkflowProgress } from "../../../src/shared/session/workflow-step.ts"
import { apply } from "../../fixture/session-state.ts"

const WORKFLOW_1 = {
  taskId: "wf-1",
  kind: "workflow",
  description: "架空の流れ1",
} satisfies BackgroundTask
const WORKFLOW_2 = {
  taskId: "wf-2",
  kind: "workflow",
  description: "架空の流れ2",
} satisfies BackgroundTask
const SHELL = {
  taskId: "bash-1",
  kind: "shell",
  description: "架空の待ち",
} satisfies BackgroundTask

const tasksChanged = (...tasks: readonly BackgroundTask[]): SessionEvent => ({
  kind: "background-tasks-changed",
  tasks,
})
const progressOf = (taskId: string, ...agentIds: readonly string[]): SessionEvent => ({
  kind: "workflow-progress",
  progress: {
    taskId,
    phases: [{ index: 0, title: "架空の段" }],
    agents: agentIds.map((agentId, index) => ({
      index,
      agentId,
      state: "progress",
      phaseTitle: "架空の段",
    })),
  },
})
const stepStarted = (
  agentId: string,
  name = "Bash",
  toolUseId = `${agentId}-${name}`,
): SessionEvent => ({
  kind: "workflow-step-started",
  agentId,
  toolUseId,
  name,
  input: { command: "架空のコマンド" },
})
const stepFinished = (agentId: string, toolUseId: string): SessionEvent => ({
  kind: "workflow-step-finished",
  agentId,
  toolUseId,
})
const agentStateOf = (
  taskId: string,
  agentId: string,
  state: "start" | "progress" | "done" | "error",
): SessionEvent => ({
  kind: "workflow-progress",
  progress: { taskId, phases: [], agents: [{ index: 0, agentId, state, phaseTitle: "" }] },
})

function runningOf(...events: readonly SessionEvent[]): readonly boolean[] {
  return apply(...events).workflowSteps.map((step) => step.running)
}

function progressesOf(...events: readonly SessionEvent[]): readonly WorkflowProgress[] {
  return apply(...events).workflowProgress
}

function stepsOf(...events: readonly SessionEvent[]): readonly (readonly [string, string])[] {
  return apply(...events).workflowSteps.map((step) => [step.taskId, step.name] as const)
}

describe("applySessionEvent（台本の段と agent の写し）", () => {
  it("顔ぶれにある台本の写しは、同じ taskId のものを丸ごと置き換える", () => {
    const progresses = progressesOf(
      tasksChanged(WORKFLOW_1, WORKFLOW_2),
      progressOf("wf-1", "agent-1", "agent-2"),
      progressOf("wf-2", "agent-3"),
      progressOf("wf-1", "agent-4"),
    )

    expect(progresses.map((progress) => [progress.taskId, progress.agents])).toEqual([
      ["wf-2", [{ index: 0, agentId: "agent-3", state: "progress", phaseTitle: "架空の段" }]],
      ["wf-1", [{ index: 0, agentId: "agent-4", state: "progress", phaseTitle: "架空の段" }]],
    ])
  })

  it("顔ぶれに無い taskId の写しと、台本でないタスクの taskId の写しは捨てる", () => {
    expect(progressesOf(progressOf("wf-1", "agent-1"))).toEqual([])
    expect(progressesOf(tasksChanged(WORKFLOW_1, SHELL), progressOf("wf-9", "agent-1"))).toEqual([])
    expect(progressesOf(tasksChanged(SHELL), progressOf("bash-1", "agent-1"))).toEqual([])
  })

  it("background-tasks-changed で顔ぶれから外れた台本の写しと手順が落ちる", () => {
    const state = apply(
      tasksChanged(WORKFLOW_1, WORKFLOW_2),
      progressOf("wf-1", "agent-1"),
      progressOf("wf-2", "agent-2"),
      stepStarted("agent-2"),
      tasksChanged(WORKFLOW_1),
    )

    expect(state.workflowProgress.map((progress) => progress.taskId)).toEqual(["wf-1"])
    expect(state.workflowSteps).toEqual([])
  })

  it("session-ended で空になる", () => {
    const state = apply(
      tasksChanged(WORKFLOW_1),
      progressOf("wf-1", "agent-1"),
      stepStarted("agent-1"),
      { kind: "session-ended", reason: "セッションが終了した" },
    )

    expect(state.workflowProgress).toEqual([])
    expect(state.workflowSteps).toEqual([])
  })
})

describe("applySessionEvent（台本の agent の手順）", () => {
  it("写しに agentId のある台本の手順が、その agent のツール呼び出しで替わる（agent_type は見ない）", () => {
    expect(
      stepsOf(
        tasksChanged(WORKFLOW_1),
        progressOf("wf-1", "agent-1"),
        stepStarted("agent-1", "Read"),
        stepStarted("agent-1", "Bash"),
      ),
    ).toEqual([["wf-1", "Bash"]])
  })

  it("台本が2本あっても、名指された agent を持つ台本の手順だけが替わる（いちばん新しい台本ではない）", () => {
    expect(
      stepsOf(
        tasksChanged(WORKFLOW_1, WORKFLOW_2),
        progressOf("wf-1", "agent-1"),
        progressOf("wf-2", "agent-2"),
        stepStarted("agent-2", "Read"),
        stepStarted("agent-1", "Bash"),
      ),
    ).toEqual([
      ["wf-2", "Read"],
      ["wf-1", "Bash"],
    ])
  })

  it("どの台本の写しにも無い agentId（メインが Agent で起こしたサブエージェント）では替わらない", () => {
    expect(
      stepsOf(
        tasksChanged(WORKFLOW_1),
        progressOf("wf-1", "agent-1"),
        stepStarted("agent-1", "Read"),
        stepStarted("subagent-1", "Bash"),
      ),
    ).toEqual([["wf-1", "Read"]])
  })

  it("写しがまだ届いていない agent の手順は捨てる", () => {
    expect(stepsOf(tasksChanged(WORKFLOW_1), stepStarted("agent-1"))).toEqual([])
    expect(
      stepsOf(tasksChanged(WORKFLOW_1), stepStarted("agent-1"), progressOf("wf-1", "agent-1")),
    ).toEqual([])
  })
})

describe("applySessionEvent（台本の手順の終わり）", () => {
  const setup = [tasksChanged(WORKFLOW_1), progressOf("wf-1", "agent-1")]

  it("始まった時刻は畳み込みの at で控え、走っている手順として置く", () => {
    const state = [...setup, stepStarted("agent-1", "Bash", "tu-1")].reduce(
      (view, event) => applySessionEvent(view, event, 1234),
      INITIAL_SESSION_STATE,
    )

    expect(state.workflowSteps.map((step) => [step.startedAt, step.running])).toEqual([
      [1234, true],
    ])
  })

  it("toolUseId が同じ終わりで手順が終わる", () => {
    expect(
      runningOf(...setup, stepStarted("agent-1", "Bash", "tu-1"), stepFinished("agent-1", "tu-1")),
    ).toEqual([false])
  })

  it("古い手順の終わり（toolUseId の不一致）と台本の agent でない終わりでは変わらない", () => {
    expect(
      runningOf(
        ...setup,
        stepStarted("agent-1", "Read", "tu-1"),
        stepStarted("agent-1", "Bash", "tu-2"),
        stepFinished("agent-1", "tu-1"),
        stepFinished("subagent-1", "tu-9"),
      ),
    ).toEqual([true])
  })

  it("agent の state が done・error になると、その agent の走っている手順が終わる", () => {
    expect(
      runningOf(
        ...setup,
        stepStarted("agent-1", "Bash", "tu-1"),
        agentStateOf("wf-1", "agent-1", "done"),
      ),
    ).toEqual([false])
    expect(
      runningOf(
        ...setup,
        stepStarted("agent-1", "Bash", "tu-1"),
        agentStateOf("wf-1", "agent-1", "error"),
      ),
    ).toEqual([false])
    expect(
      runningOf(
        ...setup,
        stepStarted("agent-1", "Bash", "tu-1"),
        agentStateOf("wf-1", "agent-1", "progress"),
      ),
    ).toEqual([true])
  })
})
