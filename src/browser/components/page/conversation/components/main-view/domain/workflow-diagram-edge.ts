// ワークフローの図の、エージェントどうしの矢印（元と先・種類）を決める。

import type { WorkflowRunAgent } from "../../../../../../../shared/session/workflow-run.ts"
import type { WorkflowDiagramArrowKind } from "./workflow-diagram-arrow.ts"

export type AgentEdge = {
  readonly from: { readonly kind: "start" } | { readonly kind: "agent"; readonly index: number }
  readonly to: { readonly kind: "agent"; readonly index: number }
  readonly kind: Exclude<WorkflowDiagramArrowKind, "toUpcoming">
}

/**
 * エージェントどうしの矢印。B が A の「後」なのは、A が終わっていて A の終わり（`startedAt` + `durationMs`）が B の `queuedAt` 以前のとき。
 * 終わりの時刻が分からないエージェント（`durationMs` か `startedAt` が無い）は前の側にならない。
 * 「後」は推移的なので、間にエージェントを挟める組を除けば推移で言える組が消える。
 * `stateOf` は箱の状態（`running`・`waiting` を見る）。
 */
export function agentEdgesOf(
  agents: readonly WorkflowRunAgent[],
  groups: readonly { readonly agents: readonly WorkflowRunAgent[] }[],
  stateOf: (agent: WorkflowRunAgent) => string,
): readonly AgentEdge[] {
  const positionOf = (agent: WorkflowRunAgent): number =>
    groups.findIndex((group) => group.agents.includes(agent))
  const sentBack = (agent: WorkflowRunAgent): boolean =>
    agent.agentType !== undefined &&
    agent.agentType !== "general-purpose" &&
    agents.some(
      (earlier) =>
        earlier.agentType === agent.agentType &&
        positionOf(earlier) < positionOf(agent) &&
        stateOf(earlier) !== "waiting",
    )
  const kindOf = (agent: WorkflowRunAgent): AgentEdge["kind"] => {
    if (sentBack(agent)) {
      return "sentBack"
    }
    const state = stateOf(agent)
    return state === "running" ? "toRunning" : state === "waiting" ? "toWaiting" : "settled"
  }

  const direct = agents.flatMap((later) =>
    agents
      .filter(
        (before) =>
          isAfter(before, later) &&
          !agents.some((between) => isAfter(before, between) && isAfter(between, later)),
      )
      .map((before) => ({ before, later })),
  )
  const roots = rootsOf(agents)
  return [
    ...(roots.length < 2
      ? []
      : roots.map((root): AgentEdge => ({
          from: { kind: "start" },
          to: { kind: "agent", index: root.index },
          kind: kindOf(root),
        }))),
    ...direct.map(({ before, later }): AgentEdge => ({
      from: { kind: "agent", index: before.index },
      to: { kind: "agent", index: later.index },
      kind: kindOf(later),
    })),
  ]
}

/** どのエージェントの「後」でもないエージェント。 */
export function rootsOf(agents: readonly WorkflowRunAgent[]): readonly WorkflowRunAgent[] {
  return agents.filter((agent) => !agents.some((before) => isAfter(before, agent)))
}

function isAfter(before: WorkflowRunAgent, later: WorkflowRunAgent): boolean {
  if (before === later || (before.state !== "done" && before.state !== "error")) {
    return false
  }
  const { startedAt, durationMs } = before
  return (
    startedAt !== undefined &&
    durationMs !== undefined &&
    later.queuedAt !== undefined &&
    startedAt + durationMs <= later.queuedAt
  )
}
