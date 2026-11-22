// バックグラウンドタスクの顔ぶれと委譲先の進みの知らせを、tsukumo 内部のイベントに変換する。
// 知らせは外部由来の値なので、unknown で受けて検証する。

import { isPlainObject } from "remeda"

import type {
  BackgroundTask,
  BackgroundTaskKind,
} from "../../../../shared/session-driver/background-task.ts"
import { parseTaskId, type TaskId } from "../../../../shared/session-driver/task-id.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import { parseToolUseId } from "../../../../shared/session/tool-use-id.ts"
import {
  WORKFLOW_AGENT_STATES,
  type WorkflowAgentStopReason,
  type WorkflowProgress,
} from "../../../../shared/session/workflow-step.ts"
import { nonBlankString } from "../../../../shared/utils/non-blank-string.ts"
import { optionalString } from "../../../../shared/utils/optional-string.ts"

/**
 * `background_tasks_changed` の `tasks`（変わったあとの全員）を内部の型に写す。
 * `tasks` が配列でなければイベントを出さない（壊れた知らせで、動いているものを空に倒さない）。
 * 要素のうち `task_id` が空でない文字列でないものと、`ambient` が true のもの（SDK が「活動の印から外せ」と言う見張り役など）は捨てる。
 * `description` が無ければ空の文字列に畳む（描く側は種類だけ出す）。
 */
export function backgroundTaskEvents(tasks: unknown): readonly SessionEvent[] {
  if (!Array.isArray(tasks)) {
    return []
  }

  return [
    {
      kind: "background-tasks-changed",
      tasks: tasks.flatMap((task): readonly BackgroundTask[] =>
        !isPlainObject(task) || task.ambient === true ? [] : backgroundTask(task),
      ),
    },
  ]
}

/**
 * `task_notification` から、Bash の背景実行の終わり（`tool_use_id` があるとき）と、タスクの完了の知らせ（`task_id` があるとき）を出す。
 * どちらも無ければ空の並び。
 */
export function taskNotificationEvents(
  message: Readonly<Record<string, unknown>>,
): readonly SessionEvent[] {
  const toolUseId = parseToolUseId(message.tool_use_id)
  const taskId = parseTaskId(message.task_id)
  return [
    ...(toolUseId === undefined ? [] : [{ kind: "background-tool-finished", toolUseId } as const]),
    ...(taskId === undefined ? [] : [{ kind: "task-notified", taskId } as const]),
  ]
}

/** `task_started` のうち、`task_type` が `local_workflow` で `task_id` があるものだけ `workflow-started` にする。 */
export function taskStartedEvents(
  message: Readonly<Record<string, unknown>>,
): readonly SessionEvent[] {
  const taskId = parseTaskId(message.task_id)
  return message.task_type === "local_workflow" && taskId !== undefined
    ? [{ kind: "workflow-started", taskId }]
    : []
}

/**
 * `workflow_progress` は SDK の公開の型に無い欄なので、要素ごとに形を確かめ、外れた要素は捨てる。
 * `error` の文・`lastToolSummary` など会話の断片になりうる欄は写さない。
 */
export function taskProgressEvents(
  message: Readonly<Record<string, unknown>>,
): readonly SessionEvent[] {
  const taskId = parseTaskId(message.task_id)
  if (taskId === undefined) {
    return []
  }

  const summary = nonBlankString(message.summary)
  return [
    ...(summary === undefined ? [] : delegateProgressEvents(taskId, summary)),
    ...workflowProgressEvents(taskId, message.workflow_progress),
  ]
}

function backgroundTask(task: Readonly<Record<string, unknown>>): readonly BackgroundTask[] {
  const taskId = parseTaskId(task.task_id)
  return taskId === undefined
    ? []
    : [
        {
          taskId,
          kind: backgroundTaskKind(task.task_type),
          description: optionalString(task.description) ?? "",
        },
      ]
}

function delegateProgressEvents(taskId: TaskId, summary: string): readonly SessionEvent[] {
  return [{ kind: "delegate-progress", taskId, summary }]
}

function workflowProgressEvents(taskId: TaskId, elements: unknown): readonly SessionEvent[] {
  if (!Array.isArray(elements)) {
    return []
  }

  return [
    {
      kind: "workflow-progress",
      progress: {
        taskId,
        phases: elements.flatMap(workflowPhase),
        agents: elements.flatMap(workflowAgent),
      },
    },
  ]
}

function workflowPhase(element: unknown): WorkflowProgress["phases"] {
  if (!isPlainObject(element) || element.type !== "workflow_phase") {
    return []
  }

  const index = numberOrUndefined(element.index, Number.isInteger)
  const title = optionalString(element.title)
  return index === undefined || title === undefined ? [] : [{ index, title }]
}

function workflowAgent(element: unknown): WorkflowProgress["agents"] {
  if (!isPlainObject(element) || element.type !== "workflow_agent") {
    return []
  }

  const index = numberOrUndefined(element.index, Number.isInteger)
  const state = WORKFLOW_AGENT_STATES.find((candidate) => candidate === element.state)
  if (index === undefined || state === undefined) {
    return []
  }

  return [
    {
      index,
      agentId: nonBlankString(element.agentId),
      label: nonBlankString(element.label),
      agentType: nonBlankString(element.agentType),
      model: nonBlankString(element.fallbackModel) ?? nonBlankString(element.model),
      phaseIndex: numberOrUndefined(element.phaseIndex, Number.isInteger),
      phaseTitle: optionalString(element.phaseTitle) ?? "",
      state,
      queuedAt: numberOrUndefined(element.queuedAt, Number.isFinite),
      startedAt: numberOrUndefined(element.startedAt, Number.isFinite),
      durationMs: numberOrUndefined(element.durationMs, Number.isFinite),
      tokens: numberOrUndefined(element.tokens, Number.isFinite),
      toolCalls: numberOrUndefined(element.toolCalls, Number.isFinite),
      attempt: numberOrUndefined(element.attempt, Number.isFinite),
      stopReason: state === "error" ? stopReasonOf(element) : undefined,
    },
  ]
}

/** `error` の文は会話の断片になりうるので、決まった語に畳んで文そのものは捨てる。 */
function stopReasonOf(element: Readonly<Record<string, unknown>>): WorkflowAgentStopReason {
  if (element.skipped === true) {
    return "skipped"
  }
  if (element.blocked === true) {
    return "blocked"
  }
  return typeof element.error === "string" && /^agent stalled/i.test(element.error)
    ? "stalled"
    : "failed"
}

function numberOrUndefined(
  value: unknown,
  accepts: (number: number) => boolean,
): number | undefined {
  return typeof value === "number" && accepts(value) ? value : undefined
}

/**
 * SDK の `task_type` を4つに畳む（{@link BackgroundTaskKind}）。
 * 実測で見たのは `local_bash`（`run_in_background` の Bash）と `local_agent`（背景のサブエージェント）と `local_workflow`（ワークフロースクリプト）の3つ。
 */
function backgroundTaskKind(taskType: unknown): BackgroundTaskKind {
  switch (taskType) {
    case "local_bash":
      return "shell"
    case "local_agent":
      return "agent"
    case "local_workflow":
      return "workflow"
    default:
      return "other"
  }
}
