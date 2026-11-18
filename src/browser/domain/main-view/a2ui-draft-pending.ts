// 書いている途中の草稿で、親に名指されたのにまだ届いていない部品を、紙の順に拾う。

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import { A2UI_ROOT_ID, a2uiChildIds } from "../../../shared/report/a2ui-report-outline.ts"
import type { MainViewDraftPending } from "../../../shared/session/main-view-draft-pending.ts"

/** 届いていない部品が1つも無い草稿。書いていない草稿もこの値になる。 */
export const NO_DRAFT_PENDING = { openSections: [] } as const satisfies MainViewDraftPending

/**
 * 根から子の参照をたどり、まだ届いていない部品を集める。根の `Report` が無ければ空。
 * `figure` と `retrospective.blocks` の参照はたどらない（草稿は図を届いたらその場で描くだけで、骨組みを置かない。振り返りは描かない）。
 * 次に届く見込みの部品が `Tabs` のタブの中にあるときは、そのタブの子の ID を `nextTab` に持つ。
 * 2か所から名指された部品は最初の1か所で数え、辿った部品は二度たどらない。
 */
export function draftPendingOf(
  byId: ReadonlyMap<string, A2uiReportComponent>,
): MainViewDraftPending {
  const root = byId.get(A2UI_ROOT_ID)
  if (root?.component !== "Report") {
    return NO_DRAFT_PENDING
  }
  const walked = root.children.reduce<{
    readonly walk: Walk
    readonly openSections: readonly string[]
  }>(
    (acc, id) => {
      const walk = walkFrom([id], byId, acc.walk)
      const open = walk.pending.length > acc.walk.pending.length
      return { walk, openSections: open ? [...acc.openSections, id] : acc.openSections }
    },
    { walk: { pending: [], visited: new Set([A2UI_ROOT_ID]) }, openSections: [] },
  )
  const [next] = walked.walk.pending
  if (next === undefined) {
    return { openSections: walked.openSections }
  }
  return { next, ...tabHolding(next, byId), openSections: walked.openSections }
}

/** `id` の部品を子孫に持つ `Tabs` の、そのタブの子の ID。どのタブの中でもなければ空。 */
function tabHolding(
  id: string,
  byId: ReadonlyMap<string, A2uiReportComponent>,
): { readonly nextTab?: string } {
  const [nextTab] = [...byId.values()]
    .flatMap((part) => (part.component === "Tabs" ? part.tabs.map((tab) => tab.child) : []))
    .filter((child) => holds(child, id, byId, new Set()))
  return nextTab === undefined ? {} : { nextTab }
}

function holds(
  from: string,
  id: string,
  byId: ReadonlyMap<string, A2uiReportComponent>,
  seen: Set<string>,
): boolean {
  if (from === id) {
    return true
  }
  const part = byId.get(from)
  if (part === undefined || seen.has(from)) {
    return false
  }
  seen.add(from)
  return a2uiChildIds(part).some((child) => holds(child, id, byId, seen))
}

type Walk = {
  /** まだ届いていない部品の ID（紙の順）。 */
  readonly pending: readonly string[]
  readonly visited: ReadonlySet<string>
}

function walkFrom(
  ids: readonly string[],
  byId: ReadonlyMap<string, A2uiReportComponent>,
  start: Walk,
): Walk {
  return ids.reduce((acc, id) => {
    if (acc.visited.has(id)) {
      return acc
    }
    const visited = new Set([...acc.visited, id])
    const part = byId.get(id)
    return part === undefined
      ? { pending: [...acc.pending, id], visited }
      : walkFrom(a2uiChildIds(part), byId, { pending: acc.pending, visited })
  }, start)
}
