// 依頼の型（`task.genre`）ごとの、最初の 1 画面の雛形。数の帯（`keyFigures`）を求めるかと、図 1 の第一候補を 1 つの表に置く。

import type { RecordedReportFigure } from "../../../shared/report/a2ui-report-catalog.ts"
import type { ReportGenre } from "../../../shared/report/report-task.ts"

type FigureKind = Exclude<RecordedReportFigure["kind"], "none">

export type RequestTemplate = {
  /** 結論に効く数が 3 つ以上あるとき、数の帯を求めるか。 */
  readonly wantsKeyFigures: boolean
  /** 図 1 の第一候補の種類。図を置いたのにここに無い種類なら外れ。 */
  readonly figures: readonly FigureKind[]
}

const REQUEST_TEMPLATES = {
  diagnosis: { wantsKeyFigures: true, figures: ["graph", "beforeAfter"] },
  timeline: { wantsKeyFigures: true, figures: ["timeline", "chart"] },
  structure: { wantsKeyFigures: true, figures: ["graph", "image"] },
  screen: { wantsKeyFigures: false, figures: ["beforeAfter", "image"] },
  decision: { wantsKeyFigures: true, figures: ["graph", "plot"] },
  research: { wantsKeyFigures: true, figures: ["chart", "plot"] },
  status: { wantsKeyFigures: true, figures: ["chart", "plot"] },
  work: { wantsKeyFigures: false, figures: ["beforeAfter", "image", "graph"] },
} as const satisfies Record<ReportGenre, RequestTemplate>

export type TemplateMiss = "key-figures" | "figure"

/**
 * 申告した型の雛形から外れた点。結論の数が 3 つ以上あるのに数の帯が無いときは `key-figures`、
 * 図を置いたのに第一候補の種類でないときは `figure`。図を置かない申告（`none`）は外れにしない。
 */
export function templateMisses(input: {
  readonly genre: ReportGenre
  readonly conclusionNumbers: number
  readonly keyFigureCount: number
  readonly figureKind: RecordedReportFigure["kind"]
}): readonly TemplateMiss[] {
  const template: RequestTemplate = REQUEST_TEMPLATES[input.genre]
  const misses: TemplateMiss[] = []
  if (
    template.wantsKeyFigures &&
    input.conclusionNumbers >= MIN_KEY_FIGURES &&
    input.keyFigureCount === 0
  ) {
    misses.push("key-figures")
  }
  if (
    input.figureKind !== "none" &&
    !template.figures.some((figure) => figure === input.figureKind)
  ) {
    misses.push("figure")
  }
  return misses
}

const MIN_KEY_FIGURES = 3
