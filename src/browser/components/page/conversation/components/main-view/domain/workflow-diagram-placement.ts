// ワークフローの図の描画で、列の並び・見出し・本体の種類・「いま」の印を決める（部品は描くだけにする）。

import type { WorkflowHandOwner } from "./workflow-agent-hand.ts"
import { stepStartOf } from "./workflow-diagram-grid.ts"
import {
  columnKeysOf,
  workflowIsCurrentColumn,
  workflowUpcomingNoteOf,
} from "./workflow-diagram-view.ts"
import type { WorkflowDiagram, WorkflowDiagramColumn } from "./workflow-diagram.ts"

/** 範囲の前の「着手」の箱を置くのは、前の列を畳んでいない図だけ。 */
export function showsPrelude(diagram: WorkflowDiagram): boolean {
  return diagram.foldedPhases === undefined
}

export function hasStartPoint(diagram: WorkflowDiagram): boolean {
  return diagram.arrows.some((arrow) => arrow.from.kind === "start")
}

/**
 * 列の本体の種類。`landing` は「これから」の列に送り出しの箱を置くとき、`upcoming` は送り出しの箱が無い「これから」の列。
 * `reachedEnd` は、依頼が済んだ図で最後の列に当たるとき（送り出し・これからの札に「いま」の印を付ける）。
 */
export type StageColumn<Landing> = {
  readonly column: WorkflowDiagramColumn
  readonly keys: readonly string[]
  readonly start: number
  readonly current: boolean
  readonly body: "landing" | "upcoming" | "agents"
  readonly reachedEnd: boolean
  readonly upcomingNote: string
  readonly landing?: Landing
  readonly selectedIndex?: number
}

export function stageColumnsOf<Landing>(
  diagram: WorkflowDiagram,
  input: {
    readonly leadCount: number
    readonly finished: boolean
    readonly planCurrentKey?: string
    readonly landingKey?: string
    readonly landing?: Landing
    readonly selected?: WorkflowHandOwner
  },
): readonly StageColumn<Landing>[] {
  const { finished, planCurrentKey } = input
  return diagram.columns.map((column, position) => {
    const current = workflowIsCurrentColumn(column, diagram.columns, finished, planCurrentKey)
    const landing = input.landingKey === column.key ? input.landing : undefined
    return {
      column,
      keys: columnKeysOf(column),
      start: stepStartOf(diagram, position, input.leadCount),
      current,
      body: column.kind !== "upcoming" ? "agents" : landing === undefined ? "upcoming" : "landing",
      reachedEnd: current && finished,
      upcomingNote: workflowUpcomingNoteOf(finished, current),
      ...(landing === undefined ? {} : { landing }),
      ...(input.selected?.kind === "agent" ? { selectedIndex: input.selected.index } : {}),
    }
  })
}

/** 列の見出し1つ。範囲の列は受け持つ段ごとに1つで、先頭だけ列の名前、残りは段の鍵を出す。 */
export type ColumnHead = {
  readonly key: string
  readonly name: string
  readonly start: number
  readonly current: boolean
  readonly duration: string
}

export function columnHeadsOf(
  stageColumn: Pick<StageColumn<unknown>, "column" | "keys" | "start" | "current">,
  columnDurations: ReadonlyMap<string, string>,
  planCurrentKey?: string,
): readonly ColumnHead[] {
  const { column, keys, start, current } = stageColumn
  const planHere = planCurrentKey !== undefined && keys.includes(planCurrentKey)
  return keys.map((key, offset) => ({
    key,
    name: offset === 0 ? column.name : key,
    start: start + offset,
    current: planHere ? key === planCurrentKey : offset === 0 && current,
    duration: columnDurations.get(key) ?? "",
  }))
}
