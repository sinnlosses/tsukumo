// 根の Report の favorOptions を、札を描く値へ整える。

import type { z } from "zod"

import type {
  A2uiReportComponent,
  favorOptionSchema,
} from "../../../../shared/report/a2ui-report-catalog.ts"

export type FavorOption = z.infer<typeof favorOptionSchema>

/** 根（Report）の favorOptions。Report が無い・欄が無ければ空。 */
export function favorOptionsOf(components: readonly A2uiReportComponent[]): readonly FavorOption[] {
  const root = components.find((part) => part.component === "Report")
  return root?.component === "Report" ? (root.favorOptions ?? []) : []
}

export function hasIrreversibleOption(options: readonly FavorOption[]): boolean {
  return options.some((option) => option.irreversible === true)
}
