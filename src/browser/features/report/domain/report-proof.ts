// 検証の行を節（主張）ごとの印にまとめる。印の導き方はここだけが持つ。

import type {
  ReportCheckPassedRow,
  ReportCheckProblemRow,
  ReportCheckStatus,
  ReportChecksView,
} from "../../../../shared/report/report-check-view.ts"

export type ReportProofMark = "ng" | "declared" | "recorded"

export type ReportProofRow = {
  readonly status: ReportCheckStatus
  readonly label: string
  readonly figure: string
  readonly time: string
  readonly recorded: boolean
  readonly runCount: number
}

export type ReportSectionProof = {
  readonly sectionId: string
  readonly mark: ReportProofMark
  /** 節に結ばれた行すべて（入力の並び）。 */
  readonly rows: readonly ReportProofRow[]
  /** `rows` のうち同じやり取りで打ったコマンドと照らせた行。控えに出す。 */
  readonly receipts: readonly ReportProofRow[]
  /** `receipts` の打った回数の合計。 */
  readonly runCount: number
}

export type ReportProofView =
  | { readonly kind: "plain" }
  | {
      readonly kind: "band"
      readonly sections: readonly ReportSectionProof[]
      readonly unboundProblems: readonly ReportCheckProblemRow[]
      readonly unboundPassed: readonly ReportCheckPassedRow[]
    }

/** `sectionIds` は根の直下の節の id。これに当たる `supports` を持つ行が1つも無ければ `plain`。 */
export function reportProofView(
  checks: ReportChecksView,
  sectionIds: readonly string[],
): ReportProofView {
  if (checks.kind === "none") {
    return { kind: "plain" }
  }
  const known = new Set(sectionIds)
  const isBound = (supports: readonly string[]): boolean => supports.some((id) => known.has(id))
  const rows = [
    ...checks.problems.map((row) => ({ row, supports: row.supports })),
    ...checks.passed.map((row) => ({ row, supports: row.supports })),
  ]
  const sections = sectionIds.flatMap((sectionId) => {
    const linked = rows
      .filter(({ supports }) => supports.includes(sectionId))
      .map(({ row }) => toProofRow(row))
    if (linked.length === 0) {
      return []
    }
    const receipts = linked.filter((row) => row.recorded)
    return [
      {
        sectionId,
        mark: markOf(linked),
        rows: linked,
        receipts,
        runCount: receipts.reduce((sum, row) => sum + row.runCount, 0),
      },
    ]
  })
  if (sections.length === 0) {
    return { kind: "plain" }
  }
  return {
    kind: "band",
    sections,
    unboundProblems: checks.problems.filter((row) => !isBound(row.supports)),
    unboundPassed: checks.passed.filter((row) => !isBound(row.supports)),
  }
}

function toProofRow(row: ReportCheckProblemRow | ReportCheckPassedRow): ReportProofRow {
  return {
    status: "status" in row ? row.status : "ok",
    label: row.label,
    figure: row.figure,
    time: row.time,
    recorded: row.recorded,
    runCount: row.runCount,
  }
}

function markOf(rows: readonly ReportProofRow[]): ReportProofMark {
  if (rows.some((row) => row.status === "ng")) {
    return "ng"
  }
  return rows.every((row) => row.status === "ok" && row.recorded) ? "recorded" : "declared"
}
