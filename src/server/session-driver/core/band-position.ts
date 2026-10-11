// 進み具合の帯の現在位置を、モデルに返す1文にする。
// 帯・札・一覧と同じ `currentPhaseOf` の結果を言い、帯の段の数え方を別に持たない。

import {
  currentPhaseOf,
  type LatestWorkPlan,
  phaseLabel,
} from "../../../shared/session/work-plan.ts"

/** 段取りが無ければ空文字列。 */
export function bandPositionText(plan: LatestWorkPlan): string {
  if (plan.kind === "none") {
    return ""
  }
  const phase = currentPhaseOf(plan)
  const position =
    phase.kind === "phase" ? `帯の今の段は ${phaseLabel(phase)}。` : "帯の段は全部済んでいる。"
  if (plan.delegatedRange.kind === "none") {
    return position
  }
  const { first, count } = plan.delegatedRange
  return `${position}委譲先の段 1〜${String(count)} は帯の ${String(first + 1)}〜${String(first + count)} 番目（委譲先の段 n は帯の ${String(first)} + n 番目）。`
}
