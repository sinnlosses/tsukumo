// `report` ツールで受け取ったレポートの検査（「検査 → 整形 → 描画」の検査の段）の入口。
// 家族（文章・塊・図・checks・雛形）の検出を並べて上限を超えたものを返し、差し戻し文と構造の差し戻し文にする。
//
// 検査するのは「レポートの記法」（`REPORT_NOTATION_PROMPT`）の条のうち、機械で判定できるものだけ。
// 読み手によって結論が変わる条（効能書き・根拠の量・前置きと締めの行など）は入れない。
// 誤って差し戻すと、直しようのない指摘でモデルを1往復させることになる。

import { keys } from "remeda"

import { MAX_CONCLUSION_SENTENCES } from "../../../../shared/report/report-limit.ts"
import { type ReportOutline, reportOutline } from "../../../../shared/report/report-outline.ts"
import {
  type BlockViolation,
  blockViolationMessage,
  detectBlockViolations,
  isBlockViolation,
} from "./block.ts"
import {
  type CheckViolation,
  checkViolationMessage,
  detectCheckViolations,
  isCheckViolation,
} from "./check.ts"
import type { ReportDraft } from "./draft.ts"
import {
  detectFigureViolations,
  type FigureViolation,
  figureViolationMessage,
  isFigureViolation,
} from "./figure.ts"
import { REPORT_CHANGED_FIELDS_ONLY_TEXT } from "./procedure-rejection.ts"
import {
  detectProseViolations,
  isProseViolation,
  type ProseViolation,
  proseViolationMessage,
} from "./prose.ts"
import { type A2uiStructureFault, a2uiStructureFaultMessage } from "./structure.ts"
import {
  detectTemplateViolations,
  isTemplateViolation,
  type TemplateViolation,
  templateViolationMessage,
} from "./template.ts"

/**
 * 規約違反1つ。`count` は違反の数（文の数・塊の数）で、モデルが書いた文面は持たない
 * （差し戻しの文面に写さないため。会話の中身をモデルの文脈へ戻す経路を作らない）。
 * `code-mismatch` の `paths` は `code` の塊の `path`（schema が決めた識別子で、書いた自由文ではない）。
 */
export type ReportViolation =
  | FigureViolation
  | ProseViolation
  | BlockViolation
  | CheckViolation
  | TemplateViolation

/** 違反にしない上限（これを超えたら違反）。 */
const VIOLATION_THRESHOLDS = {
  "long-conclusion": MAX_CONCLUSION_SENTENCES,
  "unknown-mermaid": 0,
  "too-many-notes": 2,
  "crowded-notes": 0,
  "nested-fold": 0,
  "unordered-options": 0,
  "ragged-table": 0,
  "long-table": 0,
  "many-emphasis-rows": 0,
  "emphasis-column-range": 0,
  "heat-range": 0,
  "row-depth": 0,
  "sentence-table": 0,
  "long-list": 0,
  "bad-cards": 0,
  "long-code": 0,
  "ragged-chart": 0,
  "chart-grid-shape": 0,
  "unknown-emphasis": 0,
  "chart-annotation-range": 0,
  "chart-tone-range": 0,
  "short-series": 0,
  "untitled-section": 0,
  "markdown-notation": 0,
  "broken-svg": 0,
  "unlegended-svg-tone": 0,
  "unlegended-graph-tone": 0,
  "broken-graph": 0,
  "broken-timeline": 0,
  "code-mismatch": 0,
  "code-marks-range": 0,
  "region-range": 0,
  "long-first-sentence": 0,
  "bad-heading": 0,
  "unobserved-without-how": 0,
  "arrow-in-prose": 0,
  "label-in-item": 0,
  "labeled-ordered": 0,
  "non-japanese": 0,
  "plain-word": 0,
  "figure-contradiction": 0,
  "figure-number-mismatch": 0,
  "plot-forbidden-form": 0,
  "plot-form-override": 0,
  "broken-inline-mark": 0,
  "plot-title-without-number": 0,
  "template-miss": 0,
} as const satisfies Record<ReportViolation["kind"], number>

export const REPORT_VIOLATION_KINDS = keys(VIOLATION_THRESHOLDS)

/** レポートの規約違反を並べる。空なら違反は無い。 */
export function reportViolations(report: ReportDraft): readonly ReportViolation[] {
  const outline = reportOutline(report.components)
  return FAMILIES.flatMap((rule) => rule.detect(report, outline)).filter(
    (violation) => violation.count > VIOLATION_THRESHOLDS[violation.kind],
  )
}

/**
 * 差し戻すときの `report` の戻り値。
 * 違反した条と直し方だけを1行ずつ並べ、画面の状態（描けたか・どこに出たか）は載せない。モデルの文脈に戻るので短くする。
 */
export function reportRejectionText(violations: readonly ReportViolation[]): string {
  return [
    "レポートの記法の規約に次の違反がある。直して `report` を呼び直すこと:",
    ...violations.map(
      (violation) =>
        `- ${FAMILIES.map((rule) => rule.line(violation)).find((line) => line !== undefined)}`,
    ),
    REPORT_CHANGED_FIELDS_ONLY_TEXT,
  ].join("\n")
}

/**
 * `a2ui` の版で構造の規約に外れたときの `report` の戻り値。
 * 違反 1 つにつき A2UI の `VALIDATION_FAILED` のエラーのメッセージ 1 行（JSON）を並べる。
 */
export function a2uiValidationFailedText(faults: readonly A2uiStructureFault[]): string {
  return [
    ...faults.map(a2uiStructureFaultMessage),
    "直して `components` を全部渡し、`report` を呼び直すこと。",
  ].join("\n")
}

type RuleFamily = {
  readonly detect: (report: ReportDraft, outline: ReportOutline) => readonly ReportViolation[]
  readonly line: (violation: ReportViolation) => string | undefined
}

function family<Violation extends ReportViolation>(rule: {
  readonly detect: (report: ReportDraft, outline: ReportOutline) => readonly Violation[]
  readonly owns: (violation: ReportViolation) => violation is Violation
  readonly message: (violation: Violation) => string
}): RuleFamily {
  return {
    detect: rule.detect,
    line: (violation) => (rule.owns(violation) ? rule.message(violation) : undefined),
  }
}

const FAMILIES: readonly RuleFamily[] = [
  family({
    detect: detectProseViolations,
    owns: isProseViolation,
    message: proseViolationMessage,
  }),
  family({
    detect: detectBlockViolations,
    owns: isBlockViolation,
    message: blockViolationMessage,
  }),
  family({
    detect: detectFigureViolations,
    owns: isFigureViolation,
    message: figureViolationMessage,
  }),
  family({
    detect: detectCheckViolations,
    owns: isCheckViolation,
    message: checkViolationMessage,
  }),
  family({
    detect: detectTemplateViolations,
    owns: isTemplateViolation,
    message: templateViolationMessage,
  }),
]
