// やり取りの読み位置。読む面の基準の線にいちばん近い見出しの番号と、その見出しからのずれ（px）。本文は持たない。

import type { ReadingPosition } from "../../../stores/reading-position.ts"

/** 見出しの上端がこの距離まで基準の線に近づいたら、その見出しを読んでいることにする（px）。 */
const READING_SLACK_PX = 24

/** 基準の線以前（余裕を含む）にある最後の見出しを読み位置にする。最初の見出しより上にいるときは `undefined`。 */
export function readingPositionOf(
  headingTops: readonly number[],
  baseline: number,
): ReadingPosition | undefined {
  const headingIndex = headingTops.findLastIndex((top) => top <= baseline + READING_SLACK_PX)
  const top = headingTops[headingIndex]
  return top === undefined ? undefined : { headingIndex, offsetPx: top - baseline }
}

/**
 * 覚えた見出しを覚えたずれの位置へ戻すために、転がす祖先を動かす量（px。正は下へ）。
 * 覚えた番号の見出しが無いときは `undefined`。
 */
export function scrollDeltaToRestore(
  headingTops: readonly number[],
  position: ReadingPosition,
  baseline: number,
): number | undefined {
  const top = headingTops[position.headingIndex]
  return top === undefined ? undefined : top - baseline - position.offsetPx
}
