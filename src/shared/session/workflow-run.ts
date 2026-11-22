// ワークフロースクリプト1本ごとの図の材料（体ごとの写しと直近の手順）と、それを畳む関数。

import type { BackgroundTask } from "../session-driver/background-task.ts"
import type { TaskId } from "../session-driver/task-id.ts"
import type { ToolUseId } from "./tool-use-id.ts"
import type { WorkflowAgent, WorkflowProgress, WorkflowStep } from "./workflow-step.ts"

/** 体ごとに残す手順の数。 */
const WORKFLOW_AGENT_STEP_LIMIT = 20

/**
 * 体の手順1つ。`input` は要約に使う欄1つだけに絞った入力で、画面に出すだけでログにもファイルにも書かない。
 * 時刻は畳み込みの `at`（エポックミリ秒）。`finishedAt` が無ければ走っている。
 */
export type WorkflowAgentStep = {
  readonly toolUseId: ToolUseId
  readonly name: string
  readonly input: Readonly<Record<string, string>>
  readonly startedAt: number
  readonly finishedAt?: number
  readonly failed: boolean
}

/**
 * 体1つの図の材料。`label`・`agentType` は `index` ごとに最後に届いた空でない値、`queuedAt` は最初に見た値（いちばん小さい値）を残し、ほかの欄は最新の写しのまま。
 * `steps` は直近 {@link WORKFLOW_AGENT_STEP_LIMIT} 件で古い順、`stepCount` は始まった手順の総数。
 */
export type WorkflowRunAgent = WorkflowAgent & {
  readonly steps: readonly WorkflowAgentStep[]
  readonly stepCount: number
}

/**
 * ワークフロースクリプト1本の図の材料。`ended` は顔ぶれから外れた印。
 * `agents` は `index` の順で、写しから消えた体も残す。
 */
export type WorkflowRun = {
  readonly taskId: TaskId
  readonly ended: boolean
  readonly phases: WorkflowProgress["phases"]
  readonly agents: readonly WorkflowRunAgent[]
}

/** 顔ぶれにあるワークフロースクリプトの写しだけを受け、体を `index` で合わせる。done・error になった体の走っている手順を終わりにする。 */
export function withWorkflowRunProgress(
  runs: readonly WorkflowRun[],
  tasks: readonly BackgroundTask[],
  progress: WorkflowProgress,
  at: number,
): readonly WorkflowRun[] {
  if (!tasks.some((task) => task.kind === "workflow" && task.taskId === progress.taskId)) {
    return runs
  }
  const previous = runs.find((run) => run.taskId === progress.taskId)
  const run: WorkflowRun = {
    taskId: progress.taskId,
    ended: false,
    phases: progress.phases,
    agents: mergedAgents(previous?.agents ?? [], progress.agents, at),
  }
  return previous === undefined
    ? [...runs, run]
    : runs.map((existing) => (existing === previous ? run : existing))
}

/** `agentId` の体を持つワークフロースクリプトのその体に手順を足す。どこにも無ければ元のまま。 */
export function withWorkflowRunStepStarted(
  runs: readonly WorkflowRun[],
  started: Pick<WorkflowStep, "agentId" | "toolUseId" | "name" | "input">,
  at: number,
): readonly WorkflowRun[] {
  const target = runs.find((run) => run.agents.some((agent) => agent.agentId === started.agentId))
  if (target === undefined) {
    return runs
  }
  const step: WorkflowAgentStep = {
    toolUseId: started.toolUseId,
    name: started.name,
    input: started.input,
    startedAt: at,
    failed: false,
  }
  return runs.map((run) =>
    run === target
      ? {
          ...run,
          agents: run.agents.map((agent) =>
            agent.agentId === started.agentId
              ? {
                  ...agent,
                  steps: [...agent.steps, step].slice(-WORKFLOW_AGENT_STEP_LIMIT),
                  stepCount: agent.stepCount + 1,
                }
              : agent,
          ),
        }
      : run,
  )
}

/** `toolUseId` が同じ走っている手順だけを終わりにする。 */
export function withWorkflowRunStepFinished(
  runs: readonly WorkflowRun[],
  toolUseId: ToolUseId,
  failed: boolean,
  at: number,
): readonly WorkflowRun[] {
  const finished = (step: WorkflowAgentStep): boolean =>
    step.toolUseId === toolUseId && step.finishedAt === undefined
  return runs.some((run) => run.agents.some((agent) => agent.steps.some(finished)))
    ? runs.map((run) => ({
        ...run,
        agents: run.agents.map((agent) => ({
          ...agent,
          steps: agent.steps.map((step) =>
            finished(step) ? { ...step, finishedAt: at, failed } : step,
          ),
        })),
      }))
    : runs
}

/** 顔ぶれから外れたワークフロースクリプトに終わった印を付ける（捨てない）。 */
export function markEndedWorkflowRuns(
  runs: readonly WorkflowRun[],
  tasks: readonly BackgroundTask[],
): readonly WorkflowRun[] {
  return runs.map((run) =>
    run.ended || tasks.some((task) => task.taskId === run.taskId) ? run : { ...run, ended: true },
  )
}

/** 終わった印のあるワークフロースクリプトを捨てる（走っているものは残す）。 */
export function withoutEndedWorkflowRuns(runs: readonly WorkflowRun[]): readonly WorkflowRun[] {
  return runs.some((run) => run.ended) ? runs.filter((run) => !run.ended) : runs
}

function mergedAgents(
  previous: readonly WorkflowRunAgent[],
  agents: readonly WorkflowAgent[],
  at: number,
): readonly WorkflowRunAgent[] {
  const merged = agents.map((agent) =>
    mergedAgent(
      agent,
      at,
      previous.find((candidate) => candidate.index === agent.index),
    ),
  )
  const kept = previous.filter(
    (candidate) => !agents.some((agent) => agent.index === candidate.index),
  )
  return [...merged, ...kept].toSorted((left, right) => left.index - right.index)
}

// 使用量の上限で待ちに戻った体は queuedAt が待ち始めに替わるので、最初に見た値を残す。
function mergedAgent(
  agent: WorkflowAgent,
  at: number,
  previous?: WorkflowRunAgent,
): WorkflowRunAgent {
  const steps = previous?.steps ?? []
  const ended = agent.state === "done" || agent.state === "error"
  const queued = [previous?.queuedAt, agent.queuedAt].filter((value) => value !== undefined)
  return {
    ...agent,
    label: agent.label ?? previous?.label,
    agentType: agent.agentType ?? previous?.agentType,
    queuedAt: queued.length === 0 ? undefined : Math.min(...queued),
    steps: ended
      ? steps.map((step) => (step.finishedAt === undefined ? { ...step, finishedAt: at } : step))
      : steps,
    stepCount: previous?.stepCount ?? 0,
  }
}
