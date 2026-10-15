// 進み具合の帯の現在位置を、モデルに返す1文にする。
// 帯・札・一覧と同じ `currentPhaseOf` の結果を言い、帯の段の数え方を別に持たない。

import type { DelegateReturn } from "../../../shared/session/delegate-return.ts"
import {
  currentPhaseOf,
  type LatestWorkPlan,
  phaseFinishedByReturn,
  phaseLabel,
  plannedPhasesOf,
  type WorkPlan,
} from "../../../shared/session/work-plan.ts"

const HANDBACK_NOTE_HEAD = "tsukumo の注記（委譲先の返却の本文ではない）:"

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
  if (plan.delegatedRange.kind === "pending") {
    return `${position}範囲の先頭から後ろの段は番号を持たない（委譲先の段の数が決まるまで）。`
  }
  return `${position}帯は範囲の前（前）・範囲（本）・範囲の後ろ（後）の群ごとに1から数え、本の番号は委譲先の段の番号と同じ。セリフで番号を言うのは本の段だけで、前・後の段は名前で言う。`
}

/**
 * 返却を運ぶメインの入力に添える注記。
 * `lines` は返却ごとの {@link handbackLineText}、`current` は返却を受けたあとの段取り。
 * 行が無いか段取りが無ければ空文字列。
 */
export function handbackNoteText(lines: readonly string[], current: LatestWorkPlan): string {
  if (lines.length === 0 || current.kind === "none") {
    return ""
  }
  return `${HANDBACK_NOTE_HEAD}${lines.join("")}${bandPositionText(current)}`
}

/** 返却1件が帯をどう動かしたかの1文。`previous` は返却を受ける前の段取り。 */
export function handbackLineText(previous: WorkPlan, handback: DelegateReturn): string {
  if (handback.kind === "unreadable") {
    return "返却の1行目が契約の形でなく、帯は動いていない。"
  }
  const head = `返却 \`${handbackHead(handback)}\``
  if (handback.kind === "plan") {
    return `${head} は段に数えず、帯は動いていない。`
  }
  const returned = phaseFinishedByReturn(previous, handback)
  if (returned.kind === "unmoved") {
    return `${head} では帯は動いていない。`
  }
  const label = phaseLabel({
    kind: "phase",
    indexes: [returned.phase.index],
    count: plannedPhasesOf(previous).length,
    name: returned.phase.name,
    range: previous.delegatedRange,
  })
  return `${head} で帯の ${label} が済んだ。`
}

/** `phase_result` を呼んだ委譲先の返却に添える1文。帯はその `phase_result` で動いている。 */
export const RESULT_CALLED_HANDBACK_LINE =
  "委譲先は `phase_result` で結果を返したので、返却の1行目は読んでいない。"

function handbackHead(handback: Exclude<DelegateReturn, { readonly kind: "unreadable" }>): string {
  switch (handback.kind) {
    case "plan":
      return `計画 0/${String(handback.count)}`
    case "phase-done":
      return `段 ${String(handback.phase)}/${String(handback.count)}`
    case "phase-skipped":
      return `飛ばした ${String(handback.phase)}/${String(handback.count)}`
    case "stopped":
      return `止めた ${String(handback.phase)}/${String(handback.count)}`
  }
}
