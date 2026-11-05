// ワークフロースクリプトの手順・写しに関する出来事を、`SessionState` の欄へ畳む。

import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { SessionEvent } from "./session-event.ts"
import type { SessionState } from "./session-state.ts"
import type { ToolUseId } from "./tool-use-id.ts"
import type { WorkflowProgress, WorkflowStep } from "./workflow-step.ts"

/** ワークフロースクリプトの手順・写しに関する出来事1件を畳み、変わる欄だけを返す。 */
export function foldWorkflowEvent(
  state: Pick<SessionState, "workflowSteps" | "workflowProgress" | "backgroundTasks">,
  event: Extract<
    SessionEvent,
    { kind: "workflow-step-started" | "workflow-step-finished" | "workflow-progress" }
  >,
  at: number,
): Pick<SessionState, "workflowSteps" | "workflowProgress"> {
  switch (event.kind) {
    case "workflow-step-started":
      return {
        workflowProgress: state.workflowProgress,
        workflowSteps: withWorkflowStep(
          state.workflowSteps,
          state.workflowProgress,
          {
            agentId: event.agentId,
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
          },
          at,
        ),
      }
    case "workflow-step-finished":
      return {
        workflowProgress: state.workflowProgress,
        workflowSteps: finishWorkflowStep(state.workflowSteps, event.toolUseId),
      }
    case "workflow-progress":
      return {
        workflowSteps: finishStepsOfEndedAgents(state.workflowSteps, event.progress),
        workflowProgress: withWorkflowProgress(
          state.workflowProgress,
          state.backgroundTasks,
          event.progress,
        ),
      }
  }
}

/** 顔ぶれにあるワークフロースクリプトの写しだけを受け、同じ `taskId` の写しを丸ごと置き換える。 */
function withWorkflowProgress(
  progresses: readonly WorkflowProgress[],
  tasks: readonly BackgroundTask[],
  progress: WorkflowProgress,
): readonly WorkflowProgress[] {
  return tasks.some((task) => task.kind === "workflow" && task.taskId === progress.taskId)
    ? [...progresses.filter((existing) => existing.taskId !== progress.taskId), progress]
    : progresses
}

/**
 * `agentId` を agent に持つワークフロースクリプトの手順を差し替える。どのワークフロースクリプトの写しにも無ければ元のまま。
 * SDK はワークフロースクリプトの中の `assistant` メッセージを流さないので（`tool-started` は届かない）、手順は `workflow-step-started` だけから知る。
 * `workflow-step-started` の源のフックの入力にワークフロースクリプトの `task_id` が無いので、写しの `agents` の `agentId` と突き合わせて当てる。
 */
function withWorkflowStep(
  steps: readonly WorkflowStep[],
  progresses: readonly WorkflowProgress[],
  started: Pick<WorkflowStep, "agentId" | "toolUseId" | "name" | "input">,
  at: number,
): readonly WorkflowStep[] {
  const workflow = progresses.find((progress) =>
    progress.agents.some((agent) => agent.agentId === started.agentId),
  )
  return workflow === undefined
    ? steps
    : [
        ...steps.filter((step) => step.taskId !== workflow.taskId),
        { ...started, taskId: workflow.taskId, startedAt: at, running: true },
      ]
}

/**
 * `toolUseId` が同じ手順だけを終わりにする。古い手順の終わり（新しい手順に差し替わったあとに届くもの）とワークフロースクリプトの agent でない終わりは、何も変えない。
 */
function finishWorkflowStep(
  steps: readonly WorkflowStep[],
  toolUseId: ToolUseId,
): readonly WorkflowStep[] {
  return steps.some((step) => step.toolUseId === toolUseId && step.running)
    ? steps.map((step) => (step.toolUseId === toolUseId ? { ...step, running: false } : step))
    : steps
}

/** 写しで done・error になった agent の、走っている手順を終わりにする。 */
function finishStepsOfEndedAgents(
  steps: readonly WorkflowStep[],
  progress: WorkflowProgress,
): readonly WorkflowStep[] {
  const ended = (agentId: string): boolean =>
    progress.agents.some(
      (agent) => agent.agentId === agentId && (agent.state === "done" || agent.state === "error"),
    )
  return steps.map((step) =>
    step.taskId === progress.taskId && step.running && ended(step.agentId)
      ? { ...step, running: false }
      : step,
  )
}
