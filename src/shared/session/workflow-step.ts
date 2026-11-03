// ワークフロースクリプト（台本）ごとの、いちばん新しく始まった手順（`WorkflowStep`）と、SDK が運ぶ段と agent の写し（`WorkflowProgress`）。

import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { SessionEvent } from "./session-event.ts"
import type { SessionState } from "./session-state.ts"

/**
 * ワークフロースクリプト1本の中で、いちばん新しく始まった手順。
 * `input` は要約に使う欄1つだけに絞った入力で、画面に出すだけでログにもファイルにも書かない。
 */
export type WorkflowStep = {
  readonly taskId: string
  readonly agentId: string
  readonly toolUseId: string
  readonly name: string
  readonly input: Readonly<Record<string, string>>
  /** 手順が始まった時刻（エポックミリ秒。畳み込みの `at`）。 */
  readonly startedAt: number
  /** 手順が走っているか。終わりは `finishWorkflowStep` と、agent の `state` が done・error になったとき（`finishStepsOfEndedAgents`）に付く。 */
  readonly running: boolean
}

/** 台本の agent の状態（SDK の `workflow_progress` の `workflow_agent.state`）。 */
export type WorkflowAgentState = "start" | "progress" | "done" | "error"

export const WORKFLOW_AGENT_STATES = [
  "start",
  "progress",
  "done",
  "error",
] as const satisfies readonly WorkflowAgentState[]

/**
 * ワークフロースクリプト1本の段と agent の写し（SDK の `task_progress` の `workflow_progress`）。
 * `agents` は agent の hook の `agent_id` と突き合わせる id を持つものだけで、入力の順のまま。
 * agent の `phaseTitle` はその agent が走る段の題で、欄が無いか文字列でなければ空の文字列。
 */
export type WorkflowProgress = {
  readonly taskId: string
  readonly phases: readonly { readonly index: number; readonly title: string }[]
  readonly agents: readonly {
    readonly index: number
    readonly agentId: string
    readonly state: WorkflowAgentState
    readonly phaseTitle: string
  }[]
}

/** 台本の手順・写しに関する出来事1件を畳み、変わる欄だけを返す。 */
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

/** 顔ぶれに残っているワークフロースクリプトの手順・写しだけを残す。 */
export function workflowItemsOfTasks<Item extends { readonly taskId: string }>(
  items: readonly Item[],
  tasks: readonly BackgroundTask[],
): readonly Item[] {
  return items.filter((item) => tasks.some((task) => task.taskId === item.taskId))
}

/** 顔ぶれにある台本の写しだけを受け、同じ `taskId` の写しを丸ごと置き換える。 */
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
 * `toolUseId` が同じ手順だけを終わりにする。古い手順の終わり（新しい手順に差し替わったあとに届くもの）と台本の agent でない終わりは、何も変えない。
 */
function finishWorkflowStep(
  steps: readonly WorkflowStep[],
  toolUseId: string,
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
