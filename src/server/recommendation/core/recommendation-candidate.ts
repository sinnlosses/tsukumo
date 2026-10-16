// おすすめの札の候補と、候補の並びの印。
// 候補はタスク一覧（進捗管理のデータ）と、中身を持たない「前回の続き」だけで、会話を含まない。
// 前のセッションの要約（「残り：」）も、前のセッションが有るかも候補に入れない（`docs/coding-standards.md`「会話内容の扱い」）。

import { taskReadiness, type TaskSummaryResult } from "../../../shared/repository/task-summary.ts"

/** 問い合わせに渡すタスクの候補の上限（一覧の順に上から）。 */
export const RECOMMENDATION_TASK_CANDIDATE_LIMIT = 20

/** 並べる元の1件。`resume` は前回の続きで、中身を持たない。 */
export type RecommendationCandidate =
  | { readonly kind: "resume" }
  | {
      readonly kind: "task"
      readonly id: string
      readonly summary: string
      /** このタスクを依存に挙げている未完了のタスクの ID（一覧の順）。 */
      readonly waitedBy: readonly string[]
    }

/** 問い合わせに渡す候補と、上限で渡せなかった着手できるタスクの件数。 */
export type RecommendationCandidates = {
  readonly candidates: readonly RecommendationCandidate[]
  readonly omittedCount: number
}

/**
 * 候補の並び。先頭が「前回の続き」で、続けて着手できる未着手のタスクを一覧の順に {@link RECOMMENDATION_TASK_CANDIDATE_LIMIT} 件まで。
 * 並びの順は、問い合わせの結果が届くまでの既定の並びと同じ。
 */
export function recommendationCandidates(
  tasks: Exclude<TaskSummaryResult, { readonly kind: "unknown" | "no-beads" | "loading" }>,
): RecommendationCandidates {
  const items = tasks.kind === "known" ? tasks.items : []
  const ready = items.filter((task) => taskReadiness(task)?.kind === "ready")
  const kept = ready.slice(0, RECOMMENDATION_TASK_CANDIDATE_LIMIT)
  return {
    candidates: [
      { kind: "resume" },
      ...kept.map((task): RecommendationCandidate => ({
        kind: "task",
        id: task.id,
        summary: task.summary,
        waitedBy: items
          .filter((other) => other.waitingFor.includes(task.id))
          .map((other) => other.id),
      })),
    ],
    omittedCount: ready.length - kept.length,
  }
}

/**
 * 候補の印。問い合わせに渡すものが同じなら同じ印になる。
 * 渡せなかった件数は、落としたときだけ印に入る（落としていない候補の印は件数を持たない）。
 */
export function recommendationKey(selection: RecommendationCandidates): string {
  return selection.omittedCount === 0
    ? JSON.stringify(selection.candidates)
    : JSON.stringify(selection)
}
