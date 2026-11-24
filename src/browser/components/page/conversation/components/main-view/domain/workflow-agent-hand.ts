// ワークフローの図で選んだエージェントの手元（頭と手順の並び）の材料。申し送りは持たない。

import { recordTimeAt } from "../../../../../../../shared/session/session-record.ts"
import { type TurnStep, toolDuration } from "../../../../../../../shared/session/turn-step.ts"
import type {
  WorkflowAgentStep,
  WorkflowRun,
  WorkflowRunAgent,
} from "../../../../../../../shared/session/workflow-run.ts"
import { formatElapsed, formatMeasured } from "../../../../../../../shared/utils/elapsed-time.ts"
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

/** 着手の箱の手元の名札と種類の字。図のメインの箱と同じ語。 */
const PRELUDE_NAME = "着手"
const MAIN_KIND = "メイン"

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

/** 手元の持ち主。エージェント（`index` はその鍵）か、メインの着手の箱。 */
export type WorkflowHandOwner =
  | { readonly kind: "agent"; readonly index: number }
  | { readonly kind: "prelude" }

/**
 * 選んだ箱の手元。`chosen` は利用者が箱を押して選んだか（自動で選んだときは偽で、箱は塗らない）。`steps` は古い順で持っている分（エージェントは最大 20 件）、`total` は始まった手順の総数。
 * `model` は渡されていなければ空。
 */
export type WorkflowAgentHand = {
  readonly owner: WorkflowHandOwner
  readonly chosen: boolean
  readonly state: WorkflowDiagramBoxState
  readonly name: string
  readonly kind: string
  readonly model: string
  readonly total: number
  readonly steps: readonly WorkflowHandStep[]
}

/**
 * 手元に出す箱を選ぶ。選んだ箱がこのワークフロースクリプトにあればそれ（着手の箱は `prelude` の手順が1件以上あるときだけ）、
 * 無ければ走っているエージェント（2つ以上なら最後に手順が始まったもの）、走っているものが無ければ最後に終わったもの。
 * エージェントがいなければ `hand` を持たない。
 * `prelude` は着手のメインの手順（古い順）。
 */
export function workflowHandOf(
  run: WorkflowRun,
  selected: SelectedWorkflowAgent,
  now: number,
  prelude: readonly TurnStep[],
): { readonly hand?: WorkflowAgentHand } {
  if (selected.kind === "prelude" && selected.taskId === run.taskId && prelude.length > 0) {
    return { hand: preludeHandOf(prelude, now) }
  }
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
      owner: { kind: "agent", index: agent.index },
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

function preludeHandOf(steps: readonly TurnStep[], now: number): WorkflowAgentHand {
  const shown = steps.map((step) => mainHandStepOf(step, now))
  return {
    owner: { kind: "prelude" },
    chosen: true,
    state: shown.some((step) => step.state === "running") ? "running" : "done",
    name: PRELUDE_NAME,
    kind: MAIN_KIND,
    model: "",
    total: steps.length,
    steps: shown,
  }
}

function mainHandStepOf(step: TurnStep, now: number): WorkflowHandStep {
  const startedAt = recordTimeAt(step.startedAt)
  const duration = toolDuration(step)
  const elapsed =
    duration.kind === "known"
      ? formatMeasured(duration)
      : step.status.kind === "running" && startedAt !== undefined
        ? formatElapsed(Math.max(0, Math.round((now - startedAt) / 1000)))
        : ""
  return {
    key: step.toolUseId,
    clock: startedAt === undefined ? "" : CLOCK.format(startedAt),
    state: step.status.kind,
    tool: step.name,
    target: summarizeToolInput(step.name, step.input),
    elapsed,
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
