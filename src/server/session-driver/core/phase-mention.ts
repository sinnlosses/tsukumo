// 委譲先の段の範囲があるあいだ、`speak` の `phase`（セリフが番号で言う委譲先の段）が範囲の外を指していないかの検査。

import type { DelegatedRange } from "../../../shared/session/work-plan.ts"

export type PhaseMentionVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly text: string }

/** `phase` が範囲の外の呼び出しに返す直し方。 */
const PHASE_MENTION_REJECTION_TEXT =
  "`phase` が委譲先の段の範囲の外を指している。委譲先の段を番号で言うなら、`phase` をその段の番号（1から委譲先の段の数まで）に直す。" +
  "計画・受け入れのような範囲の外の段は番号で言わず名前で言い、`phase` を省く。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/** `phase` が範囲の1〜`count` の外なら差し戻す。範囲が無ければ（`pending` も）検査しない。 */
export function judgePhaseMention(range: DelegatedRange, phase: number): PhaseMentionVerdict {
  if (range.kind !== "range" || (phase >= 1 && phase <= range.count)) {
    return { kind: "accepted" }
  }
  return { kind: "rejected", text: PHASE_MENTION_REJECTION_TEXT }
}
