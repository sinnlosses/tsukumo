// おすすめのカードの候補と、候補の並びの印。
// 候補はタスク一覧（進捗管理のデータ）と、中身を持たない「前回の続き」だけで、会話を含まない。
// 前のセッションの要約と残りも、前のセッションが有るかも候補に入れない（`docs/coding-standards.md`「会話内容の扱い」）。

import { MAX_RECOMMENDATION_CARDS } from "../../../shared/recommendation/recommendation-card.ts"
import { recommendationOrder } from "../../../shared/recommendation/recommendation-order.ts"
import type {
  TaskDifficulty,
  TaskImportance,
  TaskSummaryResult,
  TaskUrgency,
} from "../../../shared/repository/task-summary.ts"

/** 理由を書く元の1件。`resume` は前回の続きで、中身を持たない。 */
export type RecommendationCandidate =
  | { readonly kind: "resume" }
  | {
      readonly kind: "task"
      readonly id: string
      readonly summary: string
      /** このタスクを待っている、着手前か着手中のタスクの ID（一覧の順）。 */
      readonly waitedBy: readonly string[]
      readonly difficulty?: TaskDifficulty
      readonly importance: TaskImportance
      readonly urgency: TaskUrgency
      /** 依存を持ち、そのすべてが済んでいる（前の作業が済んで着手できるようになった）。 */
      readonly followsDoneWork: boolean
    }

/**
 * 候補の並び。先頭が「前回の続き」で、続けて着手できる未着手のタスクをおすすめの順に {@link MAX_RECOMMENDATION_CARDS} 件まで。
 * 画面が並べるカードは、この並びの先頭から {@link MAX_RECOMMENDATION_CARDS} 枚（前回の続きを出せない画面ではタスクだけ）。
 */
export function recommendationCandidates(
  tasks: Exclude<TaskSummaryResult, { readonly kind: "unknown" | "no-beads" | "loading" }>,
): readonly RecommendationCandidate[] {
  const items = tasks.kind === "known" ? tasks.items : []
  return [
    { kind: "resume" },
    ...recommendationOrder(items)
      .slice(0, MAX_RECOMMENDATION_CARDS)
      .map(({ task, waitedBy }): RecommendationCandidate => ({
        kind: "task",
        id: task.id,
        summary: task.summary,
        waitedBy,
        difficulty: task.difficulty,
        importance: task.importance,
        urgency: task.urgency,
        followsDoneWork: task.dependencies.length > 0,
      })),
  ]
}

/** 候補の印。理由を書く材料が同じなら同じ印になる。 */
export function recommendationKey(candidates: readonly RecommendationCandidate[]): string {
  return JSON.stringify(candidates)
}
