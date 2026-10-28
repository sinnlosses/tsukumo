// `plot` の `form` の上書きのうち、置いてはならない形として採らなかったものと、決定表と違う形を通したものの数え上げ。

import { type FigureHardRuleName, plotFormOf } from "../../../shared/report/figure-decision.ts"
import {
  drawnLeaves,
  plotsOfLeaves,
  type ReportOutline,
} from "../../../shared/report/report-outline.ts"
import { FIGURE_PREFERENCES } from "../../../shared/session/session-default.ts"

type PlotFormFaults = {
  /** 採らなかった `plot` ごとの、当たった規則の名前。 */
  readonly refused: readonly FigureHardRuleName[]
  /** どちらの図の既定で決めた形とも違う形を通した `plot` の数。 */
  readonly overrides: number
}

/**
 * 差し戻しの検査には利用者の図の既定が届かないので、上書きはどちらの既定の形とも違うときに数える。
 */
export function plotFormFaults(outline: ReportOutline): PlotFormFaults {
  const plots = plotsOfLeaves(drawnLeaves(outline))
  return {
    refused: plots.flatMap((plot) => {
      const resolution = plotFormOf(plot, plot.form, "chart")
      return resolution.kind === "refused" ? [resolution.rule] : []
    }),
    overrides: plots.filter((plot) =>
      FIGURE_PREFERENCES.every(
        (preference) => plotFormOf(plot, plot.form, preference).kind === "override",
      ),
    ).length,
  }
}
