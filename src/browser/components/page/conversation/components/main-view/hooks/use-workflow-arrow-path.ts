// ワークフローの図の矢印の座標を、箱を置いたあとに `[data-diagram-end]` の矩形を測って決める。DOM を読むのはここ1か所。

import { type RefCallback, useRef, useState } from "react"
import { isDeepEqual } from "remeda"

import { useBeforePaintSync } from "../../../../../../hooks/use-before-paint-sync.ts"
import { useResizeObservedRef } from "../../../../../../hooks/use-observed-ref.ts"
import {
  type WorkflowArrowPath,
  type WorkflowDiagramRect,
  workflowArrowPathsOf,
} from "../domain/workflow-diagram-view.ts"
import type { WorkflowDiagram, WorkflowDiagramArrow } from "../domain/workflow-diagram.ts"

/**
 * 図の根に付ける ref と、測った矢印の線。根の寸法が変わったときと、図の形が変わったとき（畳みを開いたとき）の描画の前に測り直す。
 */
export function useWorkflowArrowPaths(diagram: WorkflowDiagram): {
  readonly ref: RefCallback<HTMLDivElement>
  readonly paths: readonly WorkflowArrowPath[]
} {
  const rootRef = useRef<HTMLDivElement>(undefined)
  const [paths, setPaths] = useState<readonly WorkflowArrowPath[]>([])
  const { arrows } = diagram
  const observedRef = useResizeObservedRef<HTMLDivElement>(
    (element) => {
      rootRef.current = element
      setPaths(replacedIfChanged(arrowPathsIn(element, arrows)))
    },
    () => {
      rootRef.current = undefined
    },
  )
  useBeforePaintSync(() => {
    const root = rootRef.current
    if (root === undefined) {
      return
    }
    setPaths(replacedIfChanged(arrowPathsIn(root, arrows)))
  }, [arrows])
  return { ref: observedRef, paths }
}

/** 測り直した線が前と同じなら前の値を残し、描き直しを起こさない。 */
function replacedIfChanged(
  next: readonly WorkflowArrowPath[],
): (previous: readonly WorkflowArrowPath[]) => readonly WorkflowArrowPath[] {
  return (previous) => (isDeepEqual(previous, next) ? previous : next)
}

function arrowPathsIn(
  root: HTMLDivElement,
  arrows: readonly WorkflowDiagramArrow[],
): readonly WorkflowArrowPath[] {
  const origin = root.getBoundingClientRect()
  // 重なる面は開くときに縮めた形から広げるので、その途中で測った矩形を縮める前の寸法に戻す。
  // 寸法は動きの前後で変わらず、観測し直す合図が来ないため。
  const scale = root.offsetWidth === 0 ? 1 : origin.width / root.offsetWidth
  const rects = new Map(
    [...root.querySelectorAll<HTMLElement>("[data-diagram-end]")].map((element) => {
      const rect = element.getBoundingClientRect()
      return [
        element.dataset["diagramEnd"] ?? "",
        {
          left: (rect.left - origin.left) / scale,
          top: (rect.top - origin.top) / scale,
          width: rect.width / scale,
          height: rect.height / scale,
        },
      ] as const satisfies readonly [string, WorkflowDiagramRect]
    }),
  )
  return workflowArrowPathsOf(arrows, rects, { left: 0, top: 0 })
}
