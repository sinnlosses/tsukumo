// レポートの本文から次の一手を作る口。並びを描くのは会話の画面の側（入力欄の頭）。

import type { MainViewReportBody } from "../../../shared/session/main-view-shape.ts"
import {
  buildNextSteps,
  unobservedOf,
  type NextStep,
  type NextStepsOrigin,
} from "./domain/next-step-plan.ts"

export type { NextStep, NextStepsOrigin }

/** 部品の一覧で描かない本文（`markdown`）からは作らない。 */
export function nextStepsOfReport(
  report: MainViewReportBody,
  origin: NextStepsOrigin,
): readonly NextStep[] {
  if (report.kind === "markdown") {
    return []
  }
  return buildNextSteps({
    components: report.a2ui.kind === "surface" ? report.a2ui.components : [],
    unobserved: unobservedOf(report.a2ui.head.checks),
    ...origin,
  })
}
