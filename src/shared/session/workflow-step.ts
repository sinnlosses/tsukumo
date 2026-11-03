// ワークフロースクリプト（台本）ごとの、いちばん新しく始まった手順（`WorkflowStep`）と、SDK が運ぶ段と agent の写し（`WorkflowProgress`）。

import type { BackgroundTask } from "../session-driver/background-task.ts"

/**
 * ワークフロースクリプト1本の中で、いちばん新しく始まった手順。
 * `input` は要約に使う欄1つだけに絞った入力で、画面に出すだけでログにもファイルにも書かない。
 */
export type WorkflowStep = {
  readonly taskId: string
  readonly name: string
  readonly input: Readonly<Record<string, string>>
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
 */
export type WorkflowProgress = {
  readonly taskId: string
  readonly phases: readonly { readonly index: number; readonly title: string }[]
  readonly agents: readonly {
    readonly index: number
    readonly agentId: string
    readonly state: WorkflowAgentState
  }[]
}

/** 顔ぶれにある台本の写しだけを受け、同じ `taskId` の写しを丸ごと置き換える。 */
export function withWorkflowProgress(
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
export function withWorkflowStep(
  steps: readonly WorkflowStep[],
  progresses: readonly WorkflowProgress[],
  agentId: string,
  name: string,
  input: Readonly<Record<string, string>>,
): readonly WorkflowStep[] {
  const workflow = progresses.find((progress) =>
    progress.agents.some((agent) => agent.agentId === agentId),
  )
  return workflow === undefined
    ? steps
    : [
        ...steps.filter((step) => step.taskId !== workflow.taskId),
        { taskId: workflow.taskId, name, input },
      ]
}

/** 顔ぶれに残っているワークフロースクリプトの手順・写しだけを残す。 */
export function workflowItemsOfTasks<Item extends { readonly taskId: string }>(
  items: readonly Item[],
  tasks: readonly BackgroundTask[],
): readonly Item[] {
  return items.filter((item) => tasks.some((task) => task.taskId === item.taskId))
}
