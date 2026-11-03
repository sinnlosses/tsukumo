import { describe, expect, it } from "vitest"

import type { BackgroundTask } from "../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
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
    agents: agentIds.map((agentId, index) => ({ index, agentId, state: "progress" })),
  },
})
const stepStarted = (agentId: string, name = "Bash"): SessionEvent => ({
  kind: "workflow-step-started",
  agentId,
  name,
  input: { command: "架空のコマンド" },
})

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
      ["wf-2", [{ index: 0, agentId: "agent-3", state: "progress" }]],
      ["wf-1", [{ index: 0, agentId: "agent-4", state: "progress" }]],
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
