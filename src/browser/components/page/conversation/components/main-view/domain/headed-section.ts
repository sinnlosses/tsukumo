// 見出しのある節の欄の ID（`MainViewReportSection.id`）を数える。

import type {
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../shared/session/main-view-shape.ts"
import { reportHeadedSections } from "../../../../../../domain/main-view/main-view-report-body.ts"

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

/** 札の本文として見せるステップ。最終レポートがあればそれ、無ければ最後の本文。 */
export function shownTextStepOf(turn: MainViewTurn): MainViewStep | undefined {
  return (
    turn.steps.findLast((step) => step.final && step.body.kind === "text") ??
    turn.steps.findLast((step) => step.body.kind === "text")
  )
}

function computeHeadedSectionIds(turn: MainViewTurn): readonly number[] {
  const shown = shownTextStepOf(turn)
  return shown?.body.kind === "text"
    ? reportHeadedSections(shown.body.report).map((section) => section.id)
    : []
}
