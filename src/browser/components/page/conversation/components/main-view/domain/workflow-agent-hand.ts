// ワークフローの図で選んだエージェントの手元（頭と手順の並び）の材料。申し送りは持たない。

import type {
  WorkflowAgentStep,
  WorkflowRun,
  WorkflowRunAgent,
} from "../../../../../../../shared/session/workflow-run.ts"
import { formatElapsed } from "../../../../../../../shared/utils/elapsed-time.ts"
import { summarizeToolInput } from "../../../../../../domain/tool-summary.ts"
import type { SelectedWorkflowAgent } from "../../../stores/work-strip-step-list.ts"
import {
  type WorkflowDiagramBoxState,
  workflowAgentNameOf,
  workflowBoxStateOf,
} from "./workflow-diagram.ts"

/** 畳んだ姿で出す直近の手順の数。 */
export const WORKFLOW_HAND_RECENT = 4

/** 種類を渡さないエージェントの種類の字。 */
const DEFAULT_KIND = "既定のエージェント"

const CLOCK = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

/** 手元の手順1行。`elapsed` は終わった手順の所要と走っている手順の経過。 */
export type WorkflowHandStep = {
  readonly key: string
  readonly clock: string
  readonly state: "running" | "done" | "failed"
  readonly tool: string
  readonly target: string
  readonly elapsed: string
}

/**
 * 選んだエージェントの手元。`chosen` は利用者が箱を押して選んだか（自動で選んだときは偽で、箱は塗らない）。`steps` は古い順で持っている分（最大 20 件）、`total` は始まった手順の総数。
 * `model` は渡されていなければ空。
 */
export type WorkflowAgentHand = {
  readonly index: number
  readonly chosen: boolean
  readonly state: WorkflowDiagramBoxState
  readonly name: string
  readonly kind: string
  readonly model: string
  readonly total: number
  readonly steps: readonly WorkflowHandStep[]
}

/**
 * 手元に出すエージェントを選ぶ。選んだ箱がこのワークフロースクリプトにあればそれ、
 * 無ければ走っているエージェント（2つ以上なら最後に手順が始まったもの）、走っているものが無ければ最後に終わったもの。
 * エージェントがいなければ `hand` を持たない。
 */
export function workflowHandOf(
  run: WorkflowRun,
  selected: SelectedWorkflowAgent,
  now: number,
): { readonly hand?: WorkflowAgentHand } {
  const running = run.agents
    .filter((agent) => workflowBoxStateOf(agent, run.ended) === "running")
    .toSorted((left, right) => lastStartedAtOf(left) - lastStartedAtOf(right))
  const chosenAgent =
    selected.kind === "agent" && selected.taskId === run.taskId
      ? run.agents.find((candidate) => candidate.index === selected.index)
      : undefined
  const agent =
    chosenAgent ??
    running.at(-1) ??
    run.agents.toSorted((left, right) => finishedAtOf(left) - finishedAtOf(right)).at(-1)
  if (agent === undefined) {
    return {}
  }
  return {
    hand: {
      index: agent.index,
      chosen: chosenAgent !== undefined,
      state: workflowBoxStateOf(agent, run.ended),
      name: workflowAgentNameOf(agent),
      kind: agent.agentType ?? DEFAULT_KIND,
      model: agent.model ?? "",
      total: agent.stepCount,
      steps: agent.steps.map((step) => handStepOf(step, now)),
    },
  }
}

function lastStartedAtOf(agent: WorkflowRunAgent): number {
  return agent.steps.at(-1)?.startedAt ?? agent.startedAt ?? 0
}

function finishedAtOf(agent: WorkflowRunAgent): number {
  return agent.startedAt === undefined || agent.durationMs === undefined
    ? 0
    : agent.startedAt + agent.durationMs
}

function handStepOf(step: WorkflowAgentStep, now: number): WorkflowHandStep {
  const finishedAt = step.finishedAt ?? now
  return {
    key: step.toolUseId,
    clock: CLOCK.format(step.startedAt),
    state: step.finishedAt === undefined ? "running" : step.failed ? "failed" : "done",
    tool: step.name,
    target: summarizeToolInput(step.name, step.input),
    elapsed: formatElapsed(Math.max(0, Math.round((finishedAt - step.startedAt) / 1000))),
  }
}
