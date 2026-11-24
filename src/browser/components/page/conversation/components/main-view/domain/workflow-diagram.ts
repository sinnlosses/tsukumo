// ワークフロースクリプト1本の図の材料（`WorkflowRun`）から、図の形（列・箱・矢印）を組む。

import type {
  WorkflowRun,
  WorkflowRunAgent,
} from "../../../../../../../shared/session/workflow-run.ts"
import type {
  WorkflowAgent,
  WorkflowAgentStopReason,
} from "../../../../../../../shared/session/workflow-step.ts"
import {
  mergedArrows,
  type WorkflowDiagramArrow,
  type WorkflowDiagramArrowKind,
  type WorkflowDiagramEnd,
} from "./workflow-diagram-arrow.ts"
import { type AgentEdge, agentEdgesOf, rootsOf } from "./workflow-diagram-edge.ts"
import {
  type ColumnGroup,
  currentPositionOf,
  type PlannedColumn,
  shownColumns,
} from "./workflow-diagram-window.ts"

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

/** 列。`agents` はエージェントが載った列（`spanKeys` は受け持つ段の鍵の並びで、先頭は自分の `key`）で、`others` は「ほか n 件」。`upcoming` はエージェントがまだ載らない後ろのフェーズの「これから」の列。 */
export type WorkflowDiagramColumn =
  | {
      readonly kind: "agents"
      readonly key: string
      readonly name: string
      readonly current: boolean
      readonly spanKeys: readonly string[]
      readonly boxes: readonly WorkflowDiagramBox[]
      readonly others?: WorkflowDiagramFold
    }
  | { readonly kind: "upcoming"; readonly key: string; readonly name: string }

export type { WorkflowDiagramArrow, WorkflowDiagramArrowKind, WorkflowDiagramEnd }

/** 図の形。`foldedPhases` は「済んだ n フェーズ」に畳んだ列の数（`count`）と、その中のエージェント。 */
export type WorkflowDiagram = {
  readonly columns: readonly WorkflowDiagramColumn[]
  readonly arrows: readonly WorkflowDiagramArrow[]
  readonly foldedPhases?: WorkflowDiagramFold
  /** 利用者が開いた図だけが持つ。畳み直したとき「済んだ n フェーズ」になる段の数（`count`）。 */
  readonly refoldable?: { readonly count: number }
}

/** 列1つの箱の上限。 */
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
 * エージェントの載った列は、次にエージェントの載った列の手前までの段を受け持つ（走っている列は `planCurrentKey` の段まで）。
 * `unfold.phases` なら前の列を畳まず、`unfold.columns` にある列の鍵は「ほか n 件」に畳まない。
 * `hasPrelude` で前の列を畳んでいなければ、範囲の前のメインの「着手」の箱から最初のエージェントの箱へ矢印を引く（畳んだ図は着手の列も畳む）。
 * `unfold.refoldable` は利用者が開いた図で、畳み直せる段の数を `refoldable` に持たせる（終わって全部開いた図では立てない）。
 */
export function workflowDiagramOf(
  run: WorkflowRun,
  phaseIds: readonly string[],
  now: number,
  unfold: {
    readonly phases: boolean
    readonly refoldable?: boolean
    readonly columns: readonly string[]
  },
  planCurrentKey?: string,
  hasPrelude = false,
): WorkflowDiagram {
  const stateOf = boxStateLookupOf(run)
  const groups = spannedGroupsOf(
    columnGroupsOf(run.agents, phaseIds),
    phaseIds,
    stateOf,
    planCurrentKey,
  )
  const edges = agentEdgesOf(run.agents, groups, stateOf)
  const allColumns = plannedColumnsOf(groups, phaseIds)
  const currentPosition = currentPositionOf(groups, stateOf)
  const defaultShown = shownColumns(allColumns, currentPosition)
  const shown = unfold.phases ? allColumns : defaultShown
  const foldedGroups = foldedGroupsOf(groups, shown)
  const refoldableCount =
    unfold.refoldable === true && unfold.phases
      ? spanCountOf(foldedGroupsOf(groups, defaultShown))
      : 0

  const sendsBack = sendsBackOf(edges)
  const columns = shown.map((column) =>
    columnOf(column, {
      groups,
      currentPosition,
      stateOf,
      sendsBack,
      now,
      unfoldedKeys: unfold.columns,
    }),
  )
  const endOf = endResolverOf(foldedGroups, columns)
  const arrows = mergedArrows([
    ...(hasPrelude && foldedGroups.length === 0 ? preludeArrowsOf(run.agents, endOf) : []),
    ...edges.map((edge) => ({
      ...edge,
      from: edge.from.kind === "agent" ? endOf(edge.from.index) : edge.from,
      to: edge.to.kind === "agent" ? endOf(edge.to.index) : edge.to,
    })),
    ...upcomingArrowsOf(columns, run.agents, endOf),
  ])

  return {
    columns,
    arrows,
    ...(foldedGroups.length === 0
      ? {}
      : {
          foldedPhases: {
            count: spanCountOf(foldedGroups),
            indexes: foldedGroups.flatMap((group) => group.agents.map((agent) => agent.index)),
          },
        }),
    ...(refoldableCount === 0 ? {} : { refoldable: { count: refoldableCount } }),
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
            spanKeys: [key],
            ...(phaseIdIndex >= 0 ? { phaseIdIndex } : {}),
            ...(agent.phaseIndex === undefined ? {} : { phaseIndex: agent.phaseIndex }),
            agents: [agent],
          },
        ]
      : built.map((group) =>
          group === existing ? { ...group, agents: [...group.agents, agent] } : group,
        )
  }, [])
  return groups.toSorted(
    (left, right) =>
      (left.phaseIdIndex ?? Infinity) - (right.phaseIdIndex ?? Infinity) ||
      byPhaseIndex(left, right),
  )
}

/**
 * 各列の受け持つ段を決める。`phaseIds` に引けた列は、次に引けた列の手前までを受け持つ。
 * 走っている列は `planCurrentKey` の段までに限り、それが範囲の外・無いときは広げない。後ろに引けた列が無い列は、走っているときだけ `planCurrentKey` の段まで広げる。
 */
function spannedGroupsOf(
  groups: readonly ColumnGroup[],
  phaseIds: readonly string[],
  stateOf: (agent: WorkflowRunAgent) => WorkflowDiagramBoxState,
  planCurrentKey?: string,
): readonly ColumnGroup[] {
  const mapped = groups.flatMap((group) =>
    group.phaseIdIndex === undefined ? [] : [group.phaseIdIndex],
  )
  const currentIndex = planCurrentKey === undefined ? -1 : phaseIds.indexOf(planCurrentKey)
  return groups.map((group) => {
    const start = group.phaseIdIndex
    if (start === undefined) {
      return group
    }
    const next = mapped.find((index) => index > start)
    const running = group.agents.some((agent) => stateOf(agent) === "running")
    const limit = next ?? phaseIds.length
    const end = running
      ? currentIndex >= start && currentIndex < limit
        ? currentIndex + 1
        : start + 1
      : (next ?? start + 1)
    return end <= start + 1 ? group : { ...group, spanKeys: phaseIds.slice(start, end) }
  })
}

function byPhaseIndex(left: ColumnGroup, right: ColumnGroup): number {
  return (
    (left.phaseIndex ?? Infinity) - (right.phaseIndex ?? Infinity) ||
    firstIndexOf(left) - firstIndexOf(right)
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

function boxStateLookupOf(run: WorkflowRun): (agent: WorkflowRunAgent) => WorkflowDiagramBoxState {
  const states = new Map(
    run.agents.map((agent) => [agent.index, workflowBoxStateOf(agent, run.ended)]),
  )
  return (agent) => states.get(agent.index) ?? "done"
}

function plannedColumnsOf(
  groups: readonly ColumnGroup[],
  phaseIds: readonly string[],
): readonly PlannedColumn[] {
  const lastMapped = Math.max(
    -1,
    ...groups.map((group) =>
      group.phaseIdIndex === undefined ? -1 : group.phaseIdIndex + group.spanKeys.length - 1,
    ),
  )
  const upcoming = lastMapped < 0 ? [] : phaseIds.slice(lastMapped + 1)
  return [
    ...groups.map((group): PlannedColumn => ({ kind: "agents", group })),
    ...upcoming.map((phaseId): PlannedColumn => ({ kind: "upcoming", key: phaseId })),
  ]
}

function foldedGroupsOf(
  groups: readonly ColumnGroup[],
  kept: readonly PlannedColumn[],
): readonly ColumnGroup[] {
  return groups.filter(
    (group) => !kept.some((column) => column.kind === "agents" && column.group === group),
  )
}

function spanCountOf(folded: readonly ColumnGroup[]): number {
  return folded.reduce((sum, group) => sum + group.spanKeys.length, 0)
}

function sendsBackOf(edges: readonly AgentEdge[]): ReadonlySet<number> {
  return new Set(
    edges.flatMap((edge) =>
      edge.kind === "sentBack" && edge.from.kind === "agent" ? [edge.from.index] : [],
    ),
  )
}

type ColumnContext = {
  readonly groups: readonly ColumnGroup[]
  readonly currentPosition: number
  readonly stateOf: (agent: WorkflowRunAgent) => WorkflowDiagramBoxState
  readonly sendsBack: ReadonlySet<number>
  readonly now: number
  readonly unfoldedKeys: readonly string[]
}

function columnOf(column: PlannedColumn, context: ColumnContext): WorkflowDiagramColumn {
  if (column.kind === "upcoming") {
    return { kind: "upcoming", key: column.key, name: column.key }
  }
  const { group } = column
  const boxes = group.agents.map((agent) =>
    boxOf(agent, context.stateOf(agent), context.sendsBack.has(agent.index), context.now),
  )
  const kept =
    boxes.length <= BOX_LIMIT || context.unfoldedKeys.includes(group.key) ? boxes : keptBoxes(boxes)
  const others = boxes.filter((box) => !kept.includes(box)).map((box) => box.index)
  return {
    kind: "agents",
    key: group.key,
    name: group.name,
    current: context.groups.indexOf(group) === context.currentPosition,
    spanKeys: group.spanKeys,
    boxes: kept,
    ...(others.length === 0 ? {} : { others: { count: others.length, indexes: others } }),
  }
}

/** エージェントの箱が畳まれた先（「済んだ n フェーズ」・「ほか n 件」）を含む、矢印の端を引く関数。 */
function endResolverOf(
  foldedGroups: readonly ColumnGroup[],
  columns: readonly WorkflowDiagramColumn[],
): (index: number) => WorkflowDiagramEnd {
  return (index) => {
    if (foldedGroups.some((group) => group.agents.some((agent) => agent.index === index))) {
      return { kind: "folded" }
    }
    const column = columns.find(
      (candidate) => candidate.kind === "agents" && candidate.others?.indexes.includes(index),
    )
    return column === undefined ? { kind: "agent", index } : { kind: "others", column: column.key }
  }
}

function upcomingArrowsOf(
  columns: readonly WorkflowDiagramColumn[],
  agents: readonly WorkflowRunAgent[],
  endOf: (index: number) => WorkflowDiagramEnd,
): readonly WorkflowDiagramArrow[] {
  const lastAgent = agents.at(-1)
  const upcomingColumns = columns.filter((column) => column.kind === "upcoming")
  return upcomingColumns.flatMap((column, position) => {
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
  })
}

function preludeArrowsOf(
  agents: readonly WorkflowRunAgent[],
  endOf: (index: number) => WorkflowDiagramEnd,
): readonly WorkflowDiagramArrow[] {
  return rootsOf(agents).map((agent): WorkflowDiagramArrow => ({
    from: { kind: "prelude" },
    to: endOf(agent.index),
    kind: "settled",
  }))
}
