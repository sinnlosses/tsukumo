// 体験の記録の手続き。形は `experienceMetricContract`。受け取った入力をそのまま口へ渡すだけ。

import { implement } from "@orpc/server"

import { experienceMetricContract } from "../../../shared/contract/experience-metric.ts"
import type { SplitRelease } from "../core/experience-metric.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type ExperienceMetricProcedurePorts = {
  readonly recordSplit: (release: SplitRelease) => void
}

export function experienceMetricProcedure(ports: ExperienceMetricProcedurePorts) {
  const procedure = implement(experienceMetricContract)
  return procedure.router({
    recordSplit: procedure.recordSplit.handler(({ input }) => {
      ports.recordSplit(input)
    }),
  })
}
