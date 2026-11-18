// タブの題の頭に付ける状態の印。最新のやり取りの結果と、ページが隠れているあいだに終わったかから決める。
// 作業中だけは印の後ろに、位置と今のフェーズの名前（「2/4 名前」）を足す。

import { currentPhaseOf, type LatestWorkPlan } from "../../../../../shared/session/work-plan.ts"
import { TURN_RESULT_MARKS } from "./turn-result-mark.ts"
import type { TurnResult } from "./turn-result.ts"
import { workSegmentsOf } from "./work-segment.ts"

/** 答え待ち（お伺いがある）の印。やり取りの結果の印「?」とは別で、前から変わらない。 */
const PENDING_MARK = "●"

/**
 * 題の頭の印（無ければ空）。上の条件が先。
 * 答え待ち → 作業中 → 失敗 → 隠れているあいだに終わった完了・止めた → なし。
 */
export function tabTitleMarkOf(input: {
  readonly pendingActive: boolean
  readonly newestResult: TurnResult
  readonly endedWhileHidden: boolean
}): string {
  if (input.pendingActive) {
    return PENDING_MARK
  }
  switch (input.newestResult) {
    case "working":
    case "failed":
      return TURN_RESULT_MARKS[input.newestResult].mark
    case "done":
    case "stopped":
      return input.endedWhileHidden ? TURN_RESULT_MARKS[input.newestResult].mark : ""
    case "awaiting-answer":
    case "no-report":
      return ""
  }
}

/**
 * 結果が変わった時点で、「隠れているあいだに終わった」かを決める。
 * 作業中か答え待ちから完了・止めたへ変わり、そのときページが隠れていたときだけ真。
 * 読み込み直後の結果（変わっていない）は真にしない。
 */
export function endedWhileHiddenOf(
  previous: TurnResult,
  next: TurnResult,
  hidden: boolean,
): boolean {
  const wasOpen = previous === "working" || previous === "awaiting-answer"
  return hidden && wasOpen && (next === "done" || next === "stopped")
}

/**
 * 作業中の題に足す「2/4 今のフェーズの名前」。足さないときは空。
 * 作業中（答え待ちでない）でワークプランがあり、今のフェーズがあるときだけ。位置はプログレスバーと同じ区間の数え方。
 */
export function tabTitleProgressOf(input: {
  readonly pendingActive: boolean
  readonly newestResult: TurnResult
  readonly plan: LatestWorkPlan
}): string {
  if (input.pendingActive || input.newestResult !== "working") {
    return ""
  }
  const phase = currentPhaseOf(input.plan)
  const { position } = workSegmentsOf(input.plan, { asking: false, finished: false })
  if (phase.kind !== "phase" || position.kind !== "shown") {
    return ""
  }
  return `${position.text} ${phase.name}`
}

/** 題を組む。印が空なら元の題のまま。足す文があれば印と元の題のあいだに「 · 」で挟む。 */
export function tabTitleOf(originalTitle: string, mark: string, progress = ""): string {
  if (mark === "") {
    return originalTitle
  }
  return progress === "" ? `${mark} ${originalTitle}` : `${mark} ${progress} · ${originalTitle}`
}
