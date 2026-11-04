// 依頼の型（`task.genre`）の雛形の検査の家族。違反の型・検出・差し戻し文を持つ。
// 型ごとの最初の 1 画面の雛形として、数の帯（`keyFigures`）を求めるかと、図 1 の第一候補を 1 つの表に置く。

import type { RecordedReportFigure } from "../../../../shared/report/a2ui-report-catalog.ts"
import { reportFigureOf } from "../../../../shared/report/report-outline.ts"
import type { ReportGenre } from "../../../../shared/report/report-task.ts"
import { numberCountOutsideCode, type ReportDraft } from "./draft.ts"

type FigureKind = Exclude<RecordedReportFigure["kind"], "none">

type RequestTemplate = {
  /** 結論に効く数が 3 つ以上あるとき、数の帯を求めるか。 */
  readonly wantsKeyFigures: boolean
  /** 図 1 の第一候補の種類。図を置いたのにここに無い種類なら外れ。 */
  readonly figures: readonly FigureKind[]
}

type TemplateMiss = "key-figures" | "figure"

export type TemplateViolation =
  /**
   * 申告した依頼の型（`task.genre`）の雛形から外れた。`misses` は外れた点
   * （結論の数が 3 つ以上あるのに数の帯が無い `key-figures`、図 1 が第一候補の種類でない `figure`）。
   */
  {
    readonly kind: "template-miss"
    readonly count: number
    readonly misses: readonly TemplateMiss[]
  }

/** 雛形の違反を、当てはまらないもの（`count` が 0）も含めて並べる。型を申告していない（`unspecified`・タスク無し）なら外れは空。 */
export function detectTemplateViolations(
  report: Pick<ReportDraft, "task" | "conclusion" | "keyFigures" | "components">,
): readonly TemplateViolation[] {
  const misses = templateMissesOf(report)
  return [{ kind: "template-miss", count: misses.length, misses }]
}

export function isTemplateViolation(violation: {
  readonly kind: string
}): violation is TemplateViolation {
  return violation.kind === "template-miss"
}

/** 雛形の違反を、差し戻すときの1行の文面にする。 */
export function templateViolationMessage(violation: TemplateViolation): string {
  return `申告した依頼の型の雛形から外れた点がある（${violation.misses.join("・")}）。数の帯 \`keyFigures\` を足すか、図 1 を型の第一候補の種類にする`
}

const REQUEST_TEMPLATES = {
  diagnosis: { wantsKeyFigures: true, figures: ["graph", "compare"] },
  timeline: { wantsKeyFigures: true, figures: ["timeline", "chart"] },
  structure: { wantsKeyFigures: true, figures: ["graph", "image"] },
  screen: { wantsKeyFigures: false, figures: ["compare", "image"] },
  decision: { wantsKeyFigures: true, figures: ["graph", "plot"] },
  research: { wantsKeyFigures: true, figures: ["chart", "plot"] },
  status: { wantsKeyFigures: true, figures: ["chart", "plot"] },
  work: { wantsKeyFigures: false, figures: ["compare", "image", "graph"] },
} as const satisfies Record<ReportGenre, RequestTemplate>

const MIN_KEY_FIGURES = 3

function templateMissesOf(
  report: Pick<ReportDraft, "task" | "conclusion" | "keyFigures" | "components">,
): readonly TemplateMiss[] {
  if (report.task.kind !== "task" || report.task.genre === "unspecified") {
    return []
  }
  const template: RequestTemplate = REQUEST_TEMPLATES[report.task.genre]
  const figureKind = reportFigureOf(report.components).kind
  const misses: TemplateMiss[] = []
  if (
    template.wantsKeyFigures &&
    numberCountOutsideCode(report.conclusion) >= MIN_KEY_FIGURES &&
    report.keyFigures.length === 0
  ) {
    misses.push("key-figures")
  }
  if (figureKind !== "none" && !template.figures.some((figure) => figure === figureKind)) {
    misses.push("figure")
  }
  return misses
}
