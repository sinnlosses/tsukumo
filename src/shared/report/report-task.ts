// `report` の欄 `task`（タスクの作業のレポートの、目録の1行と見出しに出すもの）の形。形の出どころはここだけ。

import { isPlainObject } from "remeda"
import { z } from "zod"

/** 作業の終わり方。`finished` は作業を終えた、`stopped` は止めた、`awaiting-answer` は利用者の答え待ち。 */
export const REPORT_TASK_OUTCOMES = ["finished", "stopped", "awaiting-answer"] as const

export type ReportTaskOutcome = (typeof REPORT_TASK_OUTCOMES)[number]

export const reportTaskSchema = z.object({
  id: z.string().trim().min(1).describe("タスクID（タスクの一覧に出る ID そのまま）"),
  name: z
    .string()
    .trim()
    .min(1)
    .describe(
      "作業の名前だけを1行で（見出しに描く）。したこと・結果・これから変わることを混ぜない",
    ),
  outcome: z
    .enum(REPORT_TASK_OUTCOMES)
    .describe("finished（作業を終えた）/ stopped（止めた）/ awaiting-answer（利用者の答え待ち）"),
})

/** レポートが載せるタスク。タスクに紐付かないレポートと、`task` を持たなかったころの記録は `none`。 */
export type ReportTask =
  | { readonly kind: "none" }
  | {
      readonly kind: "task"
      readonly id: string
      readonly name: string
      readonly outcome: ReportTaskOutcome
    }

export const NO_REPORT_TASK = { kind: "none" } as const satisfies ReportTask

/**
 * `report` の引数の `task` を取り出す。「無い」と形の崩れは `none` に畳む。
 * 前の記録の終わり方 `shipped` は `finished` として読む。
 */
export function parseReportTask(value: unknown): ReportTask {
  const parsed = reportTaskSchema.safeParse(
    isPlainObject(value) && value.outcome === LEGACY_FINISHED_OUTCOME
      ? { ...value, outcome: "finished" }
      : value,
  )
  return parsed.success ? { kind: "task", ...parsed.data } : NO_REPORT_TASK
}

/**
 * 結論を1行で残すときの文面。`task` があれば作業の名前を頭に添える
 * （`task` のある `conclusion` には作業の名前が書かれない）。
 */
export function conclusionWithTaskName(conclusion: string, task: ReportTask): string {
  return task.kind === "task" ? `${task.name}: ${conclusion}` : conclusion
}

const LEGACY_FINISHED_OUTCOME = "shipped"
