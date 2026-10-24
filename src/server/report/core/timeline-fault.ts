// `timeline` の塊の差し戻しの位置（何個目の塊のどこか）。行の名前・時刻の字は持たない。

import type { ReportTimeline } from "../../../shared/report/timeline-block.ts"
import { readTimeline, type TimelineFault } from "../../../shared/report/timeline-scale.ts"

/** `block` は `timeline` の塊の出現順（図 → 節の順）の1始まり。 */
export type TimelineBlockFault = { readonly block: number } & TimelineFault

/** 描く順に並べた `timeline` の塊の誤りの並び。 */
export function timelineFaults(
  timelines: readonly ReportTimeline[],
): readonly TimelineBlockFault[] {
  return timelines.flatMap((timeline, index) =>
    readTimeline(timeline).faults.map((fault) => ({ block: index + 1, ...fault })),
  )
}

/** 誤りの位置の並び（「1個目の `timeline` の 3 行目」）。同じ位置は1度だけ書く。 */
export function timelineFaultPositions(faults: readonly TimelineBlockFault[]): string {
  return [...new Set(faults.map(positionOf))].join("、")
}

function positionOf(fault: TimelineBlockFault): string {
  const block = `${String(fault.block)}個目の \`timeline\` の`
  switch (fault.place.kind) {
    case "row":
      return `${block} ${String(fault.place.row)} 行目`
    case "event":
      return `${block}出来事の ${String(fault.place.event)} 個目`
    case "emphasis":
      return `${block} \`emphasis\``
  }
}
