// ドラフトの仕分け（行ごとの計画・却下・あとで）から、送る頼みと下端の口の件数を作る。

import type { DraftDrop, TaskRequest } from "./task-run-prompt.ts"

/** 行ごとの選び。選ばなかった行は `later`（あとで。触らない）。 */
export type DraftSortChoice = "plan" | "drop" | "later"

/** 選びと却下の理由。`later` の行は `choices` に持たない。 */
export type DraftSortState = {
  readonly choices: Readonly<Record<string, Exclude<DraftSortChoice, "later">>>
  readonly reasons: Readonly<Record<string, string>>
}

export const EMPTY_DRAFT_SORT: DraftSortState = { choices: {}, reasons: {} }

type SortRequest = Extract<TaskRequest, { readonly kind: "sort" }>

export type DraftSortTally = {
  readonly planCount: number
  readonly dropCount: number
  readonly laterCount: number
  readonly request: SortRequest
}

export function choiceOf(sort: DraftSortState, id: string): DraftSortChoice {
  return sort.choices[id] ?? "later"
}

/** 選びを1件ぶん入れ替える。`later` は持たないので外す。 */
export function chooseDraftSort(
  sort: DraftSortState,
  id: string,
  choice: DraftSortChoice,
): DraftSortState {
  const rest = Object.fromEntries(Object.entries(sort.choices).filter(([key]) => key !== id))
  return { ...sort, choices: choice === "later" ? rest : { ...rest, [id]: choice } }
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
    laterCount: draftIds.length - plans.length - drops.length,
    request: { kind: "sort", plans, drops },
  }
}
