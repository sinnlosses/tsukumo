// `report` ツールで受け取ったレポートの検査（「検査 → 整形 → 描画」の検査の段）。
//
// 検査するのは「レポートの記法」（`REPORT_NOTATION_PROMPT`）の条のうち、機械で判定できるものだけ。
// 読み手によって結論が変わる条（効能書き・根拠の量・前置きと締めの行など）は入れない。
// 誤って差し戻すと、直しようのない指摘でモデルを1往復させることになる。
//
// 本文は節と塊の並びで届くので、塊の種類ごとに数える。

import { reportOutline } from "../../../shared/report/report-outline.ts"
import { type ReportViolation, VIOLATION_THRESHOLDS } from "./report-violation.ts"
import { detectBlockViolations } from "./rules/block.ts"
import type { ReportDraft } from "./rules/draft.ts"
import { detectFigureViolations } from "./rules/figure.ts"
import { detectProseViolations } from "./rules/prose.ts"
import { templateMissesOf } from "./template-miss-fault.ts"

/** レポートの規約違反を並べる。空なら違反は無い。 */
export function reportViolations(report: ReportDraft): readonly ReportViolation[] {
  const outline = reportOutline(report.components)
  const templateMissList = templateMissesOf(report)

  const counted = [
    ...detectProseViolations(report, outline),
    ...detectBlockViolations(report, outline),
    ...detectFigureViolations(report, outline),
    {
      kind: "unobserved-without-how",
      count: report.checks.filter(
        (check) => check.status === "unobserved" && check.howToVerify.trim() === "",
      ).length,
    },
    { kind: "template-miss", count: templateMissList.length, misses: templateMissList },
  ] as const satisfies readonly ReportViolation[]

  return counted.filter((violation) => violation.count > VIOLATION_THRESHOLDS[violation.kind])
}
