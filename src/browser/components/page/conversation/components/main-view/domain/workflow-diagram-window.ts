// ワークフローの図で、今の列を決め、いくつの列を残して前の列を畳むかを決める。

import type { WorkflowRunAgent } from "../../../../../../../shared/session/workflow-run.ts"

/** エージェントが載った列1つ。`phaseIdIndex` は `phaseIds` に引けたときの位置。 */
export type ColumnGroup = {
  readonly key: string
  readonly name: string
  readonly phaseIdIndex?: number
  readonly phaseIndex?: number
  readonly spanKeys: readonly string[]
  readonly agents: readonly WorkflowRunAgent[]
}

export type PlannedColumn =
  | { readonly kind: "agents"; readonly group: ColumnGroup }
  | { readonly kind: "upcoming"; readonly key: string }

/** 列の上限（今の列を含む）。 */
const COLUMN_LIMIT = 4

/** 今の列は、走っているエージェントの載った列（無ければ待ちのエージェント、それも無ければエージェントの載ったいちばん後ろの列）。 */
export function currentPositionOf(
  groups: readonly ColumnGroup[],
  stateOf: (agent: WorkflowRunAgent) => string,
): number {
  const lastWith = (state: string): number =>
    groups.findLastIndex((group) => group.agents.some((agent) => stateOf(agent) === state))
  const running = lastWith("running")
  if (running >= 0) {
    return running
  }
  const waiting = lastWith("waiting")
  return waiting >= 0 ? waiting : Math.max(0, groups.length - 1)
}

/** 今の列から後ろを4段分まで残し、空いた段に今の列の直前の列を後ろから入れる。範囲の列は受け持った段の数で数える。 */
export function shownColumns(
  columns: readonly PlannedColumn[],
  currentPosition: number,
): readonly PlannedColumn[] {
  const after = columns
    .slice(currentPosition)
    .reduce<readonly PlannedColumn[]>(
      (taken, column, position) =>
        taken.length === position &&
        (position === 0 || widthOf(taken) + weightOf(column) <= COLUMN_LIMIT)
          ? [...taken, column]
          : taken,
      [],
    )
  const before = columns
    .slice(0, currentPosition)
    .toReversed()
    .reduce<readonly PlannedColumn[]>(
      (taken, column, position) =>
        taken.length === position &&
        widthOf(after) + widthOf(taken) + weightOf(column) <= COLUMN_LIMIT
          ? [...taken, column]
          : taken,
      [],
    )
    .toReversed()
  return [...before, ...after]
}

function weightOf(column: PlannedColumn): number {
  return column.kind === "agents" ? column.group.spanKeys.length : 1
}

function widthOf(columns: readonly PlannedColumn[]): number {
  return columns.reduce((sum, column) => sum + weightOf(column), 0)
}
