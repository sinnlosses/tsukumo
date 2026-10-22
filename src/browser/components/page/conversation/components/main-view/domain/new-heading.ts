// 中間レポートから最終レポートへ入れ替わったときに、足された節を数える。
// 比べるのは節の `heading` の字そのもの（`reportBodyHeadings`）で、描いた字や組んだ Markdown の字ではない。

import { reportBodyHeadings } from "../../../../../../../shared/session/main-view-report-body.ts"
import type { MainViewTurn } from "../../../../../../../shared/session/main-view-shape.ts"

/** やり取りの最後の中間レポートと最終レポートを比べた、足された節の位置（最終レポートの見出しの並びでの番号）。最終が決まっていなければ空。 */
export function newSectionIndexesOfTurn(turn: MainViewTurn): readonly number[] {
  const final = turn.steps.findLast((step) => step.final && step.body.kind === "text")
  const interim = turn.steps.findLast((step) => step.interim && step.body.kind === "text")
  if (final?.body.kind !== "text") {
    return []
  }
  return newSectionIndexesOf(
    interim?.body.kind === "text" ? reportBodyHeadings(interim.body.report) : undefined,
    reportBodyHeadings(final.body.report),
  )
}

/** 中間レポートの本文があるか。 */
export function hasShownInterim(turn: MainViewTurn): boolean {
  return turn.steps.some((step) => step.interim && step.body.kind === "text")
}

/**
 * 最終レポートの見出しのうち、最後の中間レポートに無かったものの位置。字が同じなら同じ節とみなす。
 * 中間レポートが無ければ比べる相手がないので空。
 */
export function newSectionIndexesOf(
  interimHeadings: readonly string[] | undefined,
  finalHeadings: readonly string[],
): readonly number[] {
  if (interimHeadings === undefined) {
    return []
  }
  const before = new Set(interimHeadings)
  return finalHeadings.flatMap((heading, index) => (before.has(heading) ? [] : [index]))
}
