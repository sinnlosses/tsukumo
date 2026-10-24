// 中間レポートから最終レポートへ入れ替わったときに、足された節を数える。
// 比べるのは節の `heading` の字そのもの（`reportHeadedSections`）で、描いた字や組んだ Markdown の字ではない。
// 節は欄の ID（`MainViewReportSection.id`）で指す。

import { reportHeadedSections } from "../../../../../../../shared/session/main-view-report-body.ts"
import type { MainViewTurn } from "../../../../../../../shared/session/main-view-shape.ts"

type HeadedSection = ReturnType<typeof reportHeadedSections>[number]

const NEW_SECTION_IDS_BY_TURN = new WeakMap<MainViewTurn, readonly number[]>()
const HEADED_SECTION_IDS_BY_TURN = new WeakMap<MainViewTurn, readonly number[]>()

/** やり取りの最後の中間レポートと最終レポートを比べた、足された節の欄の ID。最終が決まっていなければ空。同じ `MainViewTurn` の2回目からは覚えた結果を返す。 */
export function newSectionIdsOfTurn(turn: MainViewTurn): readonly number[] {
  return rememberedFor(NEW_SECTION_IDS_BY_TURN, turn, computeNewSectionIds)
}

/** 本文に見出しのある節の欄の ID。最終レポートがあればそれ、無ければ最後のレポート。同じ `MainViewTurn` の2回目からは覚えた結果を返す。 */
export function headedSectionIdsOfTurn(turn: MainViewTurn): readonly number[] {
  return rememberedFor(HEADED_SECTION_IDS_BY_TURN, turn, computeHeadedSectionIds)
}

/** 中間レポートの本文があるか。 */
export function hasShownInterim(turn: MainViewTurn): boolean {
  return turn.steps.some((step) => step.interim && step.body.kind === "text")
}

/**
 * 最終レポートの見出しのある節のうち、最後の中間レポートに無かったものの欄の ID。字が同じなら同じ節とみなす。
 * 中間レポートが無ければ比べる相手がないので空。
 */
export function newSectionIdsOf(
  interimSections: readonly HeadedSection[] | undefined,
  finalSections: readonly HeadedSection[],
): readonly number[] {
  if (interimSections === undefined) {
    return []
  }
  const before = new Set(interimSections.map((section) => section.heading))
  return finalSections
    .filter((section) => !before.has(section.heading))
    .map((section) => section.id)
}

function rememberedFor(
  memo: WeakMap<MainViewTurn, readonly number[]>,
  turn: MainViewTurn,
  compute: (turn: MainViewTurn) => readonly number[],
): readonly number[] {
  const remembered = memo.get(turn)
  if (remembered !== undefined) {
    return remembered
  }
  const ids = compute(turn)
  memo.set(turn, ids)
  return ids
}

function computeNewSectionIds(turn: MainViewTurn): readonly number[] {
  const final = turn.steps.findLast((step) => step.final && step.body.kind === "text")
  const interim = turn.steps.findLast((step) => step.interim && step.body.kind === "text")
  if (final?.body.kind !== "text") {
    return []
  }
  return newSectionIdsOf(
    interim?.body.kind === "text" ? reportHeadedSections(interim.body.report) : undefined,
    reportHeadedSections(final.body.report),
  )
}

function computeHeadedSectionIds(turn: MainViewTurn): readonly number[] {
  const shown =
    turn.steps.findLast((step) => step.final && step.body.kind === "text") ??
    turn.steps.findLast((step) => step.body.kind === "text")
  return shown?.body.kind === "text"
    ? reportHeadedSections(shown.body.report).map((section) => section.id)
    : []
}
