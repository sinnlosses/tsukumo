// ワークフロースクリプトごとの、いちばん新しく始まった手順（`WorkflowStep`）と、SDK が運ぶ段と agent の写し（`WorkflowProgress`）。

import type { BackgroundTask } from "../session-driver/background-task.ts"

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

/** ワークフロースクリプトの agent の状態（SDK の `workflow_progress` の `workflow_agent.state`）。 */
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

/** 顔ぶれに残っているワークフロースクリプトの手順・写しだけを残す。 */
export function workflowItemsOfTasks<Item extends { readonly taskId: string }>(
  items: readonly Item[],
  tasks: readonly BackgroundTask[],
): readonly Item[] {
  return items.filter((item) => tasks.some((task) => task.taskId === item.taskId))
}
