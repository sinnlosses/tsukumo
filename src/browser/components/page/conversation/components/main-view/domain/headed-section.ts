// 見出しのある節の欄の ID（`MainViewReportSection.id`）を数える。

import { reportHeadedSections } from "../../../../../../../shared/session/main-view-report-body.ts"
import type { MainViewTurn } from "../../../../../../../shared/session/main-view-shape.ts"

const HEADED_SECTION_IDS_BY_TURN = new WeakMap<MainViewTurn, readonly number[]>()

/** 本文に見出しのある節の欄の ID。最終レポートがあればそれ、無ければ最後のレポート。同じ `MainViewTurn` の2回目からは覚えた結果を返す。 */
export function headedSectionIdsOfTurn(turn: MainViewTurn): readonly number[] {
  const remembered = HEADED_SECTION_IDS_BY_TURN.get(turn)
  if (remembered !== undefined) {
    return remembered
  }
  const ids = computeHeadedSectionIds(turn)
  HEADED_SECTION_IDS_BY_TURN.set(turn, ids)
  return ids
}

function computeHeadedSectionIds(turn: MainViewTurn): readonly number[] {
  const shown =
    turn.steps.findLast((step) => step.final && step.body.kind === "text") ??
    turn.steps.findLast((step) => step.body.kind === "text")
  return shown?.body.kind === "text"
    ? reportHeadedSections(shown.body.report).map((section) => section.id)
    : []
}
