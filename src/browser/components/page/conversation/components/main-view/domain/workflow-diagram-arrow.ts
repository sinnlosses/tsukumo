// ワークフローの図の矢印を、同じ端の組ごとに1本へまとめる。

import { isDeepEqual } from "remeda"

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

const ARROW_PRIORITY = [
  "sentBack",
  "toRunning",
  "toWaiting",
  "settled",
  "toUpcoming",
] as const satisfies readonly WorkflowDiagramArrowKind[]

/** 同じ端の組を1本にまとめ（種類は強いほう）、畳みの中で閉じた矢印を捨てる。 */
export function mergedArrows(
  arrows: readonly WorkflowDiagramArrow[],
): readonly WorkflowDiagramArrow[] {
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
