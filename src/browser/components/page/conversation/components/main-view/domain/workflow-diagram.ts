// ワークフロースクリプト1本の図の材料（`WorkflowRun`）から、図の形（列・箱・矢印）を組む。

import { isDeepEqual } from "remeda"

import type {
  WorkflowRun,
  WorkflowRunAgent,
} from "../../../../../../../shared/session/workflow-run.ts"
import type {
  WorkflowAgent,
  WorkflowAgentStopReason,
} from "../../../../../../../shared/session/workflow-step.ts"

/** 箱の状態。`stopped` は終わったワークフロースクリプトに走っている・待ちのまま残ったエージェント。 */
export type WorkflowDiagramBoxState = "running" | "waiting" | "done" | "failed" | "stopped"

/**
 * エージェントのインスタンス1つの箱。`typeName` は種類の短い名（`agentType` の最後の `:` より後ろ）で、`hidesType` は名前と同じ語なので札を出さない印。
 * 一言の材料は、`done` の `stepCount`、`failed` の `stopReason`、差し戻しの矢印の元になったエージェントの `sendsBack`。
 * `elapsedMs` は `done`・`failed` の所要と `running` の経過で、ほかは無い。
 */
export type WorkflowDiagramBox = {
  readonly index: number
  readonly state: WorkflowDiagramBoxState
  readonly name: string
  readonly typeName?: string
  readonly hidesType: boolean
  readonly stepCount?: number
  readonly stopReason?: WorkflowAgentStopReason
  readonly sendsBack: boolean
  readonly elapsedMs?: number
}

/** 畳んだエージェントの数と、畳まれたエージェントの `index`。 */
export type WorkflowDiagramFold = {
  readonly count: number
  readonly indexes: readonly number[]
}

/** 列。`agents` はエージェントが載った列で、`others` は「ほか n 件」。`upcoming` はエージェントがまだ載らない後ろのフェーズの「これから」の列。 */
export type WorkflowDiagramColumn =
  | {
      readonly kind: "agents"
      readonly key: string
      readonly name: string
      readonly current: boolean
      readonly boxes: readonly WorkflowDiagramBox[]
      readonly others?: WorkflowDiagramFold
    }
  | { readonly kind: "upcoming"; readonly key: string; readonly name: string }

/** 矢印の端。`others` は列の「ほか n 件」、`folded` は「済んだ n フェーズ」、`upcoming` は「これから」の列。 */
export type WorkflowDiagramEnd =
  | { readonly kind: "start" }
  | { readonly kind: "agent"; readonly index: number }
  | { readonly kind: "others"; readonly column: string }
  | { readonly kind: "folded" }
  | { readonly kind: "upcoming"; readonly column: string }

export type WorkflowDiagramArrowKind =
  | "sentBack"
  | "toRunning"
  | "toWaiting"
  | "settled"
  | "toUpcoming"

export type WorkflowDiagramArrow = {
  readonly from: WorkflowDiagramEnd
  readonly to: WorkflowDiagramEnd
  readonly kind: WorkflowDiagramArrowKind
}

/** 図の形。`foldedPhases` は「済んだ n フェーズ」に畳んだ列の数（`count`）と、その中のエージェント。 */
export type WorkflowDiagram = {
  readonly columns: readonly WorkflowDiagramColumn[]
  readonly arrows: readonly WorkflowDiagramArrow[]
  readonly foldedPhases?: WorkflowDiagramFold
}

/** 列の上限（今の列を含む）と、列1つの箱の上限。 */
const COLUMN_LIMIT = 4
const BOX_LIMIT = 5

const BOX_PRIORITY = [
  "running",
  "failed",
  "waiting",
  "done",
  "stopped",
] as const satisfies readonly WorkflowDiagramBoxState[]

/**
 * 図の形を組む。`phaseIds` はワークプランのフェーズの id で、`phaseTitle` を列に当てる。
 * `unfold.phases` なら前の列を畳まず、`unfold.columns` にある列の鍵は「ほか n 件」に畳まない。
 */
export function workflowDiagramOf(
  run: WorkflowRun,
  phaseIds: readonly string[],
  now: number,
  unfold: { readonly phases: boolean; readonly columns: readonly string[] },
): WorkflowDiagram {
  const groups = columnGroupsOf(run.agents, phaseIds)
  const states = new Map(
    run.agents.map((agent) => [agent.index, workflowBoxStateOf(agent, run.ended)]),
  )
  const stateOf = (agent: WorkflowRunAgent): WorkflowDiagramBoxState =>
    states.get(agent.index) ?? "done"
  const edges = agentEdgesOf(run.agents, groups, stateOf)
  const sendsBack = new Set(
    edges.flatMap((edge) =>
      edge.kind === "sentBack" && edge.from.kind === "agent" ? [edge.from.index] : [],
    ),
  )

  const lastMapped = Math.max(-1, ...groups.map((group) => group.phaseIdIndex ?? -1))
  const upcoming = lastMapped < 0 ? [] : phaseIds.slice(lastMapped + 1)
  const allColumns: readonly PlannedColumn[] = [
    ...groups.map((group): PlannedColumn => ({ kind: "agents", group })),
    ...upcoming.map((phaseId): PlannedColumn => ({ kind: "upcoming", key: phaseId })),
  ]
  const currentPosition = currentPositionOf(groups, stateOf)
  const shown = unfold.phases ? allColumns : shownColumns(allColumns, currentPosition)
  const foldedGroups = groups.filter(
    (group) => !shown.some((column) => column.kind === "agents" && column.group === group),
  )

  const columns = shown.map((column): WorkflowDiagramColumn => {
    if (column.kind === "upcoming") {
      return { kind: "upcoming", key: column.key, name: column.key }
    }
    const { group } = column
    const boxes = group.agents.map((agent) =>
      boxOf(agent, stateOf(agent), sendsBack.has(agent.index), now),
    )
    const kept =
      boxes.length <= BOX_LIMIT || unfold.columns.includes(group.key) ? boxes : keptBoxes(boxes)
    const others = boxes.filter((box) => !kept.includes(box)).map((box) => box.index)
    return {
      kind: "agents",
      key: group.key,
      name: group.name,
      current: groups.indexOf(group) === currentPosition,
      boxes: kept,
      ...(others.length === 0 ? {} : { others: { count: others.length, indexes: others } }),
    }
  })

  const endOf = (index: number): WorkflowDiagramEnd => {
    if (foldedGroups.some((group) => group.agents.some((agent) => agent.index === index))) {
      return { kind: "folded" }
    }
    const column = columns.find(
      (candidate) => candidate.kind === "agents" && candidate.others?.indexes.includes(index),
    )
    return column === undefined ? { kind: "agent", index } : { kind: "others", column: column.key }
  }
  const upcomingColumns = columns.filter((column) => column.kind === "upcoming")
  const lastAgent = run.agents.at(-1)
  const upcomingArrows: readonly WorkflowDiagramArrow[] = upcomingColumns.flatMap(
    (column, position) => {
      const previous = upcomingColumns[position - 1]
      const sources: readonly WorkflowDiagramEnd[] =
        previous !== undefined
          ? [{ kind: "upcoming", column: previous.key }]
          : lastAgent === undefined
            ? []
            : [endOf(lastAgent.index)]
      return sources.map((from): WorkflowDiagramArrow => ({
        from,
        to: { kind: "upcoming", column: column.key },
        kind: "toUpcoming",
      }))
    },
  )
  const arrows = mergedArrows([
    ...edges.map((edge) => ({
      ...edge,
      from: edge.from.kind === "agent" ? endOf(edge.from.index) : edge.from,
      to: edge.to.kind === "agent" ? endOf(edge.to.index) : edge.to,
    })),
    ...upcomingArrows,
  ])

  const foldedIndexes = foldedGroups.flatMap((group) => group.agents.map((agent) => agent.index))
  return {
    columns,
    arrows,
    ...(foldedGroups.length === 0
      ? {}
      : { foldedPhases: { count: foldedGroups.length, indexes: foldedIndexes } }),
  }
}

/** 名札。`label`、無ければ種類の短い名、それも無ければ「エージェント n」。 */
export function workflowAgentNameOf(
  agent: Pick<WorkflowAgent, "index" | "label" | "agentType">,
): string {
  return agent.label ?? agent.agentType?.split(":").at(-1) ?? `エージェント ${String(agent.index)}`
}

/** エージェント1つの箱の状態。`ended` はワークフロースクリプトが顔ぶれから外れた印。 */
export function workflowBoxStateOf(
  agent: Pick<WorkflowAgent, "state" | "startedAt">,
  ended: boolean,
): WorkflowDiagramBoxState {
  switch (agent.state) {
    case "done":
      return "done"
    case "error":
      return "failed"
    case "progress":
      return ended ? "stopped" : "running"
    case "start":
      return ended ? "stopped" : agent.startedAt === undefined ? "waiting" : "running"
  }
}

/** エージェントが載った列1つ。`phaseIdIndex` は `phaseIds` に引けたときの位置。 */
type ColumnGroup = {
  readonly key: string
  readonly name: string
  readonly phaseIdIndex?: number
  readonly phaseIndex?: number
  readonly agents: readonly WorkflowRunAgent[]
}

type PlannedColumn =
  | { readonly kind: "agents"; readonly group: ColumnGroup }
  | { readonly kind: "upcoming"; readonly key: string }

/**
 * エージェントを列に分けて並べる。`phaseIds` に1つでも引ければ、引けた列を `phaseIds` の順に、引けない列をそのあとに置く。
 * 引けない列どうしと、1つも引けないときの全部の列は、`phaseIndex` の小さい順、同じなら最初に現れたエージェントの `index` の順。
 */
function columnGroupsOf(
  agents: readonly WorkflowRunAgent[],
  phaseIds: readonly string[],
): readonly ColumnGroup[] {
  const groups = agents.reduce<readonly ColumnGroup[]>((built, agent) => {
    const phaseIdIndex = phaseIds.indexOf(agent.phaseTitle)
    const key =
      phaseIdIndex >= 0
        ? agent.phaseTitle
        : `${String(agent.phaseIndex ?? "")}\u0000${agent.phaseTitle}`
    const existing = built.find((group) => group.key === key)
    return existing === undefined
      ? [
          ...built,
          {
            key,
            name: columnNameOf(agent),
            ...(phaseIdIndex >= 0 ? { phaseIdIndex } : {}),
            ...(agent.phaseIndex === undefined ? {} : { phaseIndex: agent.phaseIndex }),
            agents: [agent],
          },
        ]
      : built.map((group) =>
          group === existing ? { ...group, agents: [...group.agents, agent] } : group,
        )
  }, [])
  const byPhaseIndex = (left: ColumnGroup, right: ColumnGroup): number =>
    (left.phaseIndex ?? Infinity) - (right.phaseIndex ?? Infinity) ||
    firstIndexOf(left) - firstIndexOf(right)
  return groups.toSorted(
    (left, right) =>
      (left.phaseIdIndex ?? Infinity) - (right.phaseIdIndex ?? Infinity) ||
      byPhaseIndex(left, right),
  )
}

function firstIndexOf(group: ColumnGroup): number {
  return Math.min(...group.agents.map((agent) => agent.index))
}

function columnNameOf(agent: WorkflowRunAgent): string {
  if (agent.phaseTitle !== "") {
    return agent.phaseTitle
  }
  return agent.phaseIndex === undefined ? "フェーズ" : `フェーズ ${String(agent.phaseIndex + 1)}`
}

/** 今の列は、走っているエージェントの載った列（無ければ待ちのエージェント、それも無ければエージェントの載ったいちばん後ろの列）。 */
function currentPositionOf(
  groups: readonly ColumnGroup[],
  stateOf: (agent: WorkflowRunAgent) => WorkflowDiagramBoxState,
): number {
  const lastWith = (state: WorkflowDiagramBoxState): number =>
    groups.findLastIndex((group) => group.agents.some((agent) => stateOf(agent) === state))
  const running = lastWith("running")
  if (running >= 0) {
    return running
  }
  const waiting = lastWith("waiting")
  return waiting >= 0 ? waiting : Math.max(0, groups.length - 1)
}

/** 今の列から後ろを4つまで残し、空いた枠に今の列の直前の列を後ろから入れる。 */
function shownColumns(
  columns: readonly PlannedColumn[],
  currentPosition: number,
): readonly PlannedColumn[] {
  const after = columns.slice(currentPosition, currentPosition + COLUMN_LIMIT)
  const room = COLUMN_LIMIT - after.length
  const before =
    room === 0 ? [] : columns.slice(Math.max(0, currentPosition - room), currentPosition)
  return [...before, ...after]
}

function boxOf(
  agent: WorkflowRunAgent,
  state: WorkflowDiagramBoxState,
  sendsBack: boolean,
  now: number,
): WorkflowDiagramBox {
  const typeName = agent.agentType?.split(":").at(-1)
  const name = workflowAgentNameOf(agent)
  const elapsedMs =
    state === "done" || state === "failed"
      ? agent.durationMs
      : state === "running" && agent.startedAt !== undefined
        ? now - agent.startedAt
        : undefined
  return {
    index: agent.index,
    state,
    name,
    ...(typeName === undefined ? {} : { typeName }),
    hidesType: typeName !== undefined && typeName.toLowerCase() === name.toLowerCase(),
    ...(state === "done" ? { stepCount: agent.stepCount } : {}),
    ...(state === "failed" && agent.stopReason !== undefined
      ? { stopReason: agent.stopReason }
      : {}),
    sendsBack,
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
  }
}

/** 6つ以上の箱から、状態の順（同じ状態の中では新しい順）に4つを選び、`index` の順に並べ直す。 */
function keptBoxes(boxes: readonly WorkflowDiagramBox[]): readonly WorkflowDiagramBox[] {
  const chosen = boxes
    .toSorted(
      (left, right) =>
        BOX_PRIORITY.indexOf(left.state) - BOX_PRIORITY.indexOf(right.state) ||
        right.index - left.index,
    )
    .slice(0, BOX_LIMIT - 1)
  return boxes.filter((box) => chosen.includes(box))
}

type AgentEdge = {
  readonly from: { readonly kind: "start" } | { readonly kind: "agent"; readonly index: number }
  readonly to: { readonly kind: "agent"; readonly index: number }
  readonly kind: Exclude<WorkflowDiagramArrowKind, "toUpcoming">
}

/**
 * エージェントどうしの矢印。B が A の「後」なのは、A が終わっていて A の終わり（`startedAt` + `durationMs`）が B の `queuedAt` 以前のとき。
 * 終わりの時刻が分からないエージェント（`durationMs` か `startedAt` が無い）は前の側にならない。
 * 「後」は推移的なので、間にエージェントを挟める組を除けば推移で言える組が消える。
 */
function agentEdgesOf(
  agents: readonly WorkflowRunAgent[],
  groups: readonly ColumnGroup[],
  stateOf: (agent: WorkflowRunAgent) => WorkflowDiagramBoxState,
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
  const roots = agents.filter((agent) => !agents.some((before) => isAfter(before, agent)))
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

const ARROW_PRIORITY = [
  "sentBack",
  "toRunning",
  "toWaiting",
  "settled",
  "toUpcoming",
] as const satisfies readonly WorkflowDiagramArrowKind[]

/** 同じ端の組を1本にまとめ（種類は強いほう）、畳みの中で閉じた矢印を捨てる。 */
function mergedArrows(arrows: readonly WorkflowDiagramArrow[]): readonly WorkflowDiagramArrow[] {
  return arrows.reduce<readonly WorkflowDiagramArrow[]>((merged, arrow) => {
    if (isDeepEqual(arrow.from, arrow.to)) {
      return merged
    }
    const same = merged.find(
      (existing) => isDeepEqual(existing.from, arrow.from) && isDeepEqual(existing.to, arrow.to),
    )
    if (same === undefined) {
      return [...merged, arrow]
    }
    return ARROW_PRIORITY.indexOf(arrow.kind) < ARROW_PRIORITY.indexOf(same.kind)
      ? merged.map((existing) => (existing === same ? arrow : existing))
      : merged
  }, [])
}
