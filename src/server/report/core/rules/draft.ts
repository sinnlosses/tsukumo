import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { KeyFigures } from "../../../../shared/report/report-block-comparison.ts"
import type { ReportCheck } from "../../../../shared/report/report-check.ts"
import type { ReportTask } from "../../../../shared/report/report-task.ts"
import type { WorkPlanClosing } from "../../../../shared/session/work-plan.ts"

/** 検査にかけるレポート。`checks` の「無い」は空の配列、`favor` の「無い」は空の文字列。 */
export type ReportDraft = {
  readonly conclusion: string
  /** `conclusion` の要素ごとの字数（`ParsedConclusion`）。 */
  readonly conclusionSentenceChars: readonly number[]
  /** 結論の直下に並べる数。「無い」は空の配列。 */
  readonly keyFigures: KeyFigures
  /** 検査が節・図・振り返りの葉を取り出す部品の一覧（`reportOutline`）。「無い」は空の配列。 */
  readonly components: readonly A2uiReportComponent[]
  readonly favor: string
  readonly checks: readonly ReportCheck[]
  /** `code` の塊の `path` → 読めたファイルの中身。読めなかった `path` は入らない。 */
  readonly fileContents: ReadonlyMap<string, string>
  /** 載せたタスク。記法の検査には使わず、段の残りの差し戻し（`ReportReview`）が終わり方を読む。 */
  readonly task: ReportTask
  /** 段の閉じ方。記法の検査には使わず、段の閉じ方の差し戻し（`ReportReview`）が読む。 */
  readonly workPlanClosing: WorkPlanClosing
}
