// `report` の `a2ui` の版の部品の一覧を、節と葉の ID の並びにたどる。

import { type A2uiReportComponent, LEAF_COMPONENT_KINDS } from "./a2ui-report-catalog.ts"

/** 根の部品の ID（A2UI の仕様が根を `root` と決めている）。 */
export const A2UI_ROOT_ID = "root"

export type A2uiReportPart<Component extends A2uiReportComponent["component"]> = Extract<
  A2uiReportComponent,
  { readonly component: Component }
>

/**
 * 根の子 1 つが写る節。`Section` は見出しつきの節、それ以外は見出しの無い節になる。
 * `leafIds` は節に並ぶ葉の ID で、`Section` と配置の部品の中へ降りて並び順に平らにしたもの。
 */
export type A2uiOutlineSection =
  | {
      readonly kind: "section"
      readonly componentId: string
      readonly heading: string
      readonly leafIds: readonly string[]
    }
  | { readonly kind: "loose"; readonly componentId: string; readonly leafIds: readonly string[] }

/** 部品の ID → 部品。同じ ID が 2 つ以上あれば最初のもの。 */
export function a2uiPartsById(
  components: readonly A2uiReportComponent[],
): ReadonlyMap<string, A2uiReportComponent> {
  const byId = new Map<string, A2uiReportComponent>()
  for (const part of components) {
    if (!byId.has(part.id)) {
      byId.set(part.id, part)
    }
  }
  return byId
}

/**
 * 根の子を並び順に節へ写す。辿れない参照は飛ばし、葉の残らない `Section` 以外の子は節にしない。
 * 入れ子の `Section` と配置の部品の中の葉は、外側の節へ並び順に平らに入れる。
 */
export function a2uiOutlineSections(
  root: A2uiReportPart<"Report">,
  byId: ReadonlyMap<string, A2uiReportComponent>,
): readonly A2uiOutlineSection[] {
  return root.children.flatMap((id): readonly A2uiOutlineSection[] => {
    const child = byId.get(id)
    if (child === undefined) {
      return []
    }
    const leafIds = a2uiLeafIds([id], byId)
    if (child.component === "Section") {
      return [{ kind: "section", componentId: id, heading: child.heading, leafIds }]
    }
    return leafIds.length === 0 ? [] : [{ kind: "loose", componentId: id, leafIds }]
  })
}

/** ID の並びの先の葉の ID を並び順に集める。`Section` と配置の部品は中へ降り、根と辿った ID は二度たどらない。 */
export function a2uiLeafIds(
  ids: readonly string[],
  byId: ReadonlyMap<string, A2uiReportComponent>,
): readonly string[] {
  return leafIdsOf(ids, byId, new Set([A2UI_ROOT_ID]))
}

/** 葉の部品なら写す先の塊の `kind`、葉でなければ undefined。 */
export function a2uiLeafKind(part: A2uiReportComponent): string | undefined {
  return LEAF_KINDS.get(part.component)
}

const LEAF_KINDS: ReadonlyMap<string, string> = new Map(Object.entries(LEAF_COMPONENT_KINDS))

function leafIdsOf(
  ids: readonly string[],
  byId: ReadonlyMap<string, A2uiReportComponent>,
  visited: ReadonlySet<string>,
): readonly string[] {
  let seen = visited
  return ids.flatMap((id) => {
    const part = byId.get(id)
    if (part === undefined || seen.has(id)) {
      return []
    }
    seen = new Set([...seen, id])
    return a2uiLeafKind(part) === undefined ? leafIdsOf(childIdsOf(part), byId, seen) : [id]
  })
}

/** 部品が子として参照する ID。葉と `ChoicePicker` は持たない。 */
function childIdsOf(part: A2uiReportComponent): readonly string[] {
  switch (part.component) {
    case "Section":
    case "Row":
    case "Column":
      return part.children
    case "Card":
      return [part.child]
    case "Tabs":
      return part.tabs.map((tab) => tab.child)
    default:
      return []
  }
}
