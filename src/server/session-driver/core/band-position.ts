// 進み具合の帯の現在位置を、モデルに返す1文にする。
// 帯・札・一覧と同じ `currentPhaseOf` の結果を言い、帯の段の数え方を別に持たない。

import { phaseLabel } from "../../../shared/session/work-plan-phase-number.ts"
import { currentPhaseOf, type LatestWorkPlan } from "../../../shared/session/work-plan.ts"

const HANDBACK_NOTE_HEAD = "tsukumo の注記（委譲先の返却の本文ではない）:"

/** ワークプランが無ければ空文字列。 */
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
  if (plan.delegatedRange.kind === "pending") {
    return `${position}範囲の先頭から後ろの段は番号を持たない（委譲先の段の数が決まるまで）。`
  }
  return `${position}帯は範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数え、本の番号は委譲先の段の番号と同じ。セリフで番号を言うのは本の段だけで、前・後の段は名前で言う。`
}

/**
 * 返却を運ぶメインの入力に添える注記。
 * `lines` は返却ごとの1文（{@link RESULT_CALLED_HANDBACK_LINE}・{@link PHASE_RESULT_MISSING_HANDBACK_LINE}）、`current` は返却を受けたあとのワークプラン。
 * 行が無いかワークプランが無ければ空文字列。
 */
export function handbackNoteText(lines: readonly string[], current: LatestWorkPlan): string {
  if (lines.length === 0 || current.kind === "none") {
    return ""
  }
  return `${HANDBACK_NOTE_HEAD}${lines.join("")}${bandPositionText(current)}`
}

/** `phase_result` を呼んだ委譲先の返却に添える1文。帯はその `phase_result` で動いている。 */
export const RESULT_CALLED_HANDBACK_LINE = "委譲先は `phase_result` で結果を返した。"

/** `phase_result` を呼ばなかった委譲先の返却に添える1文。計画だけの回は呼ばない決まりなので、帯が動いていない事実だけを言う。 */
export const PHASE_RESULT_MISSING_HANDBACK_LINE =
  "委譲先は `phase_result` を呼ばなかったので、返却では帯は動いていない（計画だけの回なら正しい）。"
