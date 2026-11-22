// ワークフロースクリプトごとの、いちばん新しく始まった手順（`WorkflowStep`）と、SDK が運ぶ段と agent の写し（`WorkflowProgress`）。

import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { TaskId } from "../session-driver/task-id.ts"
import type { ToolUseId } from "./tool-use-id.ts"

/**
 * ワークフロースクリプト1本の中で、いちばん新しく始まった手順。
 * `input` は要約に使う欄1つだけに絞った入力で、画面に出すだけでログにもファイルにも書かない。
 */
export type WorkflowStep = {
  readonly taskId: TaskId
  readonly agentId: string
  readonly toolUseId: ToolUseId
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
 * 止まった agent の止まり方（`workflow_agent` の `skipped`・`blocked`・`error` の文から決まった語に畳んだもの）。
 * `stalled` は CLI の「応答が止まった」の決まった文（`agent stalled` で始まる）で、どれにも当たらなければ `failed`。
 */
export type WorkflowAgentStopReason = "skipped" | "blocked" | "stalled" | "failed"

/**
 * ワークフロースクリプトの agent 1体の写し（SDK の `workflow_agent`）。体の鍵は `index`。
 * `agentId` は agent の hook の `agent_id` と突き合わせる id で、並びの門で待つ体には無い。
 * `phaseTitle` はその agent が走る段の題で、欄が無いか文字列でなければ空の文字列。
 * `model` は `fallbackModel` があればその値。時刻はエポックミリ秒。
 * `stopReason` は `state` が `error` の体だけに付く。
 */
export type WorkflowAgent = {
  readonly index: number
  readonly agentId?: string
  readonly label?: string
  readonly agentType?: string
  readonly model?: string
  readonly phaseIndex?: number
  readonly phaseTitle: string
  readonly state: WorkflowAgentState
  readonly queuedAt?: number
  readonly startedAt?: number
  readonly durationMs?: number
  readonly tokens?: number
  readonly toolCalls?: number
  readonly attempt?: number
  readonly stopReason?: WorkflowAgentStopReason
}

/**
 * ワークフロースクリプト1本の段と agent の写し（SDK の `task_progress` の `workflow_progress`）。
 * `agents` は入力の順のまま。
 */
export type WorkflowProgress = {
  readonly taskId: TaskId
  readonly phases: readonly { readonly index: number; readonly title: string }[]
  readonly agents: readonly WorkflowAgent[]
}

/** hook の `agent_id` と突き合わせる id を持つ agent だけ（並びの門で待つ体を除く）。 */
export function hookedAgents(
  progress: WorkflowProgress,
): readonly (WorkflowAgent & { readonly agentId: string })[] {
  return progress.agents.flatMap((agent) =>
    agent.agentId === undefined ? [] : [{ ...agent, agentId: agent.agentId }],
  )
}

/** 顔ぶれに残っているワークフロースクリプトの手順・写しだけを残す。 */
export function workflowItemsOfTasks<Item extends { readonly taskId: TaskId }>(
  items: readonly Item[],
  tasks: readonly BackgroundTask[],
): readonly Item[] {
  return items.filter((item) => tasks.some((task) => task.taskId === item.taskId))
}
