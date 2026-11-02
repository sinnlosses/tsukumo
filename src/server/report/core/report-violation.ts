// `report` ツールで受け取ったレポートの検査に使う、規約違反の種類・上限。

import { keys } from "remeda"

import { MAX_CONCLUSION_SENTENCES } from "../../../shared/report/report-limit.ts"
import type { TemplateMiss } from "./request-template.ts"
import type { BlockViolation } from "./rules/block.ts"
import type { FigureViolation } from "./rules/figure.ts"
import type { ProseViolation } from "./rules/prose.ts"

/**
 * 規約違反1つ。`count` は違反の数（文の数・塊の数）で、モデルが書いた文面は持たない
 * （差し戻しの文面に写さないため。会話の中身をモデルの文脈へ戻す経路を作らない）。
 * `code-mismatch` の `paths` は `code` の塊の `path`（schema が決めた識別子で、書いた自由文ではない）。
 */
export type ReportViolation =
  | FigureViolation
  | ProseViolation
  | BlockViolation
  /** `checks` の `unobserved` の行の `howToVerify` が空（空白だけを含む）。`count` は該当の行の数。 */
  | { readonly kind: "unobserved-without-how"; readonly count: number }
  /**
   * 申告した依頼の型（`task.genre`）の雛形から外れた。`misses` は外れた点
   * （結論の数が 3 つ以上あるのに数の帯が無い `key-figures`、図 1 が第一候補の種類でない `figure`）。
   */
  | {
      readonly kind: "template-miss"
      readonly count: number
      readonly misses: readonly TemplateMiss[]
    }

/** 違反にしない上限（これを超えたら違反）。 */
export const VIOLATION_THRESHOLDS = {
  "long-conclusion": MAX_CONCLUSION_SENTENCES,
  "unknown-mermaid": 0,
  "too-many-notes": 2,
  "crowded-notes": 0,
  "nested-fold": 0,
  "unordered-options": 0,
  "ragged-table": 0,
  "long-table": 0,
  "many-emphasis-rows": 0,
  "sentence-table": 0,
  "long-list": 0,
  "bad-cards": 0,
  "long-code": 0,
  "ragged-chart": 0,
  "unknown-emphasis": 0,
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
