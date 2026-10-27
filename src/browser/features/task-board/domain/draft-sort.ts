// ドラフトの仕分け（行ごとの計画・却下・保留）から、送る頼みと帯の件数を作る。

import type { DraftDrop, TaskRequest } from "./task-run-prompt.ts"

/** 行ごとの選び。選ばなかった行は `hold`（触らない）。 */
export type DraftSortChoice = "plan" | "drop" | "hold"

/** 選びと却下の理由。`hold` の行は `choices` に持たない。 */
export type DraftSortState = {
  readonly choices: Readonly<Record<string, Exclude<DraftSortChoice, "hold">>>
  readonly reasons: Readonly<Record<string, string>>
}

export const EMPTY_DRAFT_SORT: DraftSortState = { choices: {}, reasons: {} }

type SortRequest = Extract<TaskRequest, { readonly kind: "sort" }>

export type DraftSortTally = {
  readonly planCount: number
  readonly dropCount: number
  readonly holdCount: number
  readonly request: SortRequest
}

export function choiceOf(sort: DraftSortState, id: string): DraftSortChoice {
  return sort.choices[id] ?? "hold"
}

/** `draftIds`（一覧の順のドラフトの ID）のうち、選ばれたものだけを頼みに並べる。ドラフトでなくなった ID は数えない。 */
export function tallyDraftSort(draftIds: readonly string[], sort: DraftSortState): DraftSortTally {
  const plans = draftIds.filter((id) => choiceOf(sort, id) === "plan")
  const drops = draftIds
    .filter((id) => choiceOf(sort, id) === "drop")
    .map((id): DraftDrop => ({ id, reason: sort.reasons[id] ?? "" }))
  return {
    planCount: plans.length,
    dropCount: drops.length,
    holdCount: draftIds.length - plans.length - drops.length,
    request: { kind: "sort", plans, drops },
  }
}
