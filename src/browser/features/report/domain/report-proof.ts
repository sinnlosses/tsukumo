// 検証の行を節（主張）ごとの印にまとめ、冒頭の帯の目盛りと数を導く。印の導き方はここだけが持つ。

import type {
  ReportCheckPassedRow,
  ReportCheckProblemRow,
  ReportCheckStatus,
  ReportChecksView,
} from "../../../../shared/report/report-check-view.ts"
import type { ReportNotDoneView } from "../../../../shared/report/report-not-done.ts"

/** 節の印。落ちた・申告のみ・記録ありの順が帯の目盛りの並び。 */
const REPORT_PROOF_MARKS = ["ng", "declared", "recorded"] as const

export type ReportProofMark = (typeof REPORT_PROOF_MARKS)[number]

export type ReportProofRow = {
  readonly status: ReportCheckStatus
  readonly label: string
  readonly figure: string
  readonly time: string
  readonly recorded: boolean
}

export type ReportSectionProof = {
  readonly sectionId: string
  readonly mark: ReportProofMark
  /** 節に結ばれた行すべて（入力の並び）。 */
  readonly rows: readonly ReportProofRow[]
  /** `rows` のうち同じやり取りで打ったコマンドと照らせた行。控えに出す。 */
  readonly receipts: readonly ReportProofRow[]
}

export type ReportProofTick =
  | { readonly kind: "section"; readonly sectionId: string; readonly mark: ReportProofMark }
  | { readonly kind: "not-done"; readonly text: string }

export type ReportProofCount = {
  readonly kind: ReportProofMark | "not-done"
  readonly count: number
}

export type ReportProofView =
  | { readonly kind: "plain" }
  | {
      readonly kind: "band"
      readonly sections: readonly ReportSectionProof[]
      readonly ticks: readonly ReportProofTick[]
      /** 主張の数（結ばれた節の数）。 */
      readonly claimCount: number
      /** 種類ごとの数。0 の種類は持たない。 */
      readonly counts: readonly ReportProofCount[]
      readonly unboundProblems: readonly ReportCheckProblemRow[]
      readonly unboundPassed: readonly ReportCheckPassedRow[]
    }

/**
 * `sectionIds` は根の直下の節の id。これに当たる `supports` を持つ行が1つも無ければ `plain`。
 * `notDone` は目盛りにだけ使い、`plain` かどうかは決めない。
 */
export function reportProofView(
  checks: ReportChecksView,
  sectionIds: readonly string[],
  notDone: ReportNotDoneView,
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
    return linked.length === 0
      ? []
      : [
          {
            sectionId,
            mark: markOf(linked),
            rows: linked,
            receipts: linked.filter((row) => row.recorded),
          },
        ]
  })
  if (sections.length === 0) {
    return { kind: "plain" }
  }
  const ordered = REPORT_PROOF_MARKS.flatMap((mark) =>
    sections.filter((section) => section.mark === mark),
  )
  const notDoneItems = notDone.kind === "listed" ? notDone.items : []
  const ticks: readonly ReportProofTick[] = [
    ...ordered.map((section) => ({
      kind: "section" as const,
      sectionId: section.sectionId,
      mark: section.mark,
    })),
    ...notDoneItems.map((text) => ({ kind: "not-done" as const, text })),
  ]
  const counts = [
    ...REPORT_PROOF_MARKS.map((mark) => ({
      kind: mark,
      count: sections.filter((section) => section.mark === mark).length,
    })),
    { kind: "not-done" as const, count: notDoneItems.length },
  ].filter((entry) => entry.count > 0)
  return {
    kind: "band",
    sections,
    ticks,
    claimCount: sections.length,
    counts,
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
  }
}

function markOf(rows: readonly ReportProofRow[]): ReportProofMark {
  if (rows.some((row) => row.status === "ng")) {
    return "ng"
  }
  return rows.every((row) => row.status === "ok" && row.recorded) ? "recorded" : "declared"
}
