// おすすめの札の候補と、候補の並びの印。
// 候補はタスク一覧（進捗管理のデータ）と、中身を持たない「前回の続き」だけで、会話を含まない。
// 前のセッションの要約（「残り：」）も、前のセッションが有るかも候補に入れない（`docs/coding-standards.md`「会話内容の扱い」）。

import {
  taskReadiness,
  type TaskSummaryResult,
  unfinishedTaskIds,
} from "../../../shared/repository/task-summary.ts"

/** 問い合わせに渡すタスクの候補の上限（一覧の順に上から）。 */
export const RECOMMENDATION_TASK_CANDIDATE_LIMIT = 20

/** 並べる元の1件。`resume` は前回の続きで、中身を持たない。 */
export type RecommendationCandidate =
  | { readonly kind: "resume" }
  | {
      readonly kind: "task"
      readonly id: string
      readonly summary: string
      /** タスクの `difficulty`（`haiku` < `sonnet` < `opus` の順に重い）。書かれていなければ空文字。 */
      readonly difficulty: string
      /** このタスクを依存に挙げている未完了のタスクの ID（一覧の順）。 */
      readonly waitedBy: readonly string[]
    }

/**
 * 候補の並び。先頭が「前回の続き」で、続けて着手できる未着手のタスクを一覧の順に {@link RECOMMENDATION_TASK_CANDIDATE_LIMIT} 件まで。
 * 並びの順は、問い合わせの結果が届くまでの既定の並びと同じ。
 */
export function recommendationCandidates(
  tasks: Exclude<TaskSummaryResult, { readonly kind: "unknown" | "off" }>,
): readonly RecommendationCandidate[] {
  return [{ kind: "resume" }, ...(tasks.kind === "known" ? readyTaskCandidates(tasks.items) : [])]
}

/** 候補の並びの印。問い合わせに渡すものが同じなら同じ印になる。 */
export function recommendationKey(candidates: readonly RecommendationCandidate[]): string {
  return JSON.stringify(candidates)
}

function readyTaskCandidates(
  items: Extract<TaskSummaryResult, { readonly kind: "known" }>["items"],
): readonly RecommendationCandidate[] {
  const unfinished = unfinishedTaskIds(items)
  return items
    .filter((task) => taskReadiness(task, unfinished)?.kind === "ready")
    .slice(0, RECOMMENDATION_TASK_CANDIDATE_LIMIT)
    .map((task) => ({
      kind: "task",
      id: task.id,
      summary: task.summary,
      difficulty: task.difficulty ?? "",
      waitedBy: items
        .filter((other) => unfinished.has(other.id) && other.dependencies.includes(task.id))
        .map((other) => other.id),
    }))
}
