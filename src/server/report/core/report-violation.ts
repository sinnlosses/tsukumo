// `report` ツールで受け取ったレポートの検査に使う、検査にかけるレポートの形と、規約違反の種類・上限。

import { keys } from "remeda"

import type { RecordedReportFigure, ReportSection } from "../../../shared/report/report-block.ts"
import type { ReportCheck } from "../../../shared/report/report-check.ts"
import { MAX_CONCLUSION_SENTENCES } from "../../../shared/report/report-limit.ts"
import type { ReportTask } from "../../../shared/report/report-task.ts"
import type { WorkPlanClosing } from "../../../shared/session/work-plan.ts"
import type { GraphFault, MermaidFault, SvgFault } from "./report-figure-fault.ts"
import type { MarkdownNotation } from "./report-markdown-notation.ts"

/** 検査にかけるレポート。`sections` と `checks` の「無い」は空の配列、`favor` の「無い」は空の文字列。 */
export type ReportDraft = {
  readonly conclusion: string
  readonly figure: RecordedReportFigure
  readonly sections: readonly ReportSection[]
  readonly favor: string
  readonly checks: readonly ReportCheck[]
  /** `code` の塊の `path` → 読めたファイルの中身。読めなかった `path` は入らない。 */
  readonly fileContents: ReadonlyMap<string, string>
  /** 構文が割れた `mermaid` の塊（`figure` を含む）。検査できなかったときも、割れた塊が無いときも空。 */
  readonly mermaidFaults: readonly MermaidFault[]
  /** 載せたタスク。記法の検査には使わず、段の残りの差し戻し（`ReportReview`）が終わり方を読む。 */
  readonly task: ReportTask
  /** 段の閉じ方。記法の検査には使わず、段の閉じ方の差し戻し（`ReportReview`）が読む。 */
  readonly workPlanClosing: WorkPlanClosing
}

/**
 * 規約違反1つ。`count` は違反の数（文の数・塊の数）で、モデルが書いた文面は持たない
 * （差し戻しの文面に写さないため。会話の中身をモデルの文脈へ戻す経路を作らない）。
 * `code-mismatch` の `paths` は `code` の塊の `path`（schema が決めた識別子で、書いた自由文ではない）。
 */
export type ReportViolation =
  /** `conclusion` が3文以上ある（条1「冒頭の1〜2文で結論」）。 */
  | { readonly kind: "long-conclusion"; readonly count: number }
  /** 4文以上の地の文がある（「地の文の段落は3文まで」）。`count` は `text` の塊と逃げ道の段落の数。 */
  | { readonly kind: "long-paragraph"; readonly count: number }
  /** `mermaid` の塊に、規約が挙げる種類（`REPORT_MERMAID_KINDS`）の外の種類がある。 */
  | { readonly kind: "unknown-mermaid"; readonly count: number }
  /** `note` の塊が3つ以上ある（「1つのレポートに1〜2個まで」）。 */
  | { readonly kind: "too-many-notes"; readonly count: number }
  /**
   * `note` が隣り合う、または見出しのある節の先頭にある。`count` は該当の `note` の数。
   * `tone` が `warn` / `ng` のものは数えない。
   */
  | { readonly kind: "crowded-notes"; readonly count: number }
  /** `fold` を持つ `markdown` の塊が `<details>` を含む、または `<details>` が入れ子になっている。`count` は塊の数。 */
  | { readonly kind: "nested-fold"; readonly count: number }
  /** `options` の候補、`compare` / `beforeAfter` の側の箇条、または `image` の `notes` が上限を超えている塊がある。`count` は塊の数。 */
  | { readonly kind: "too-many-candidates"; readonly count: number }
  /** 候補が採る → 検討 → 採らないの順に並んでいない `options` の塊がある。`count` は塊の数。 */
  | { readonly kind: "unordered-options"; readonly count: number }
  /** 行のセルの数が `columns` と揃わない表がある。`count` は表の数。 */
  | { readonly kind: "ragged-table"; readonly count: number }
  /** 行が上限を超えるのに `rest` が空の `table` がある。`count` は表の数。 */
  | { readonly kind: "long-table"; readonly count: number }
  /** 行が2つ以上で、ある列のセルの平均が全角 `SENTENCE_CELL_LENGTH` 字以上の `table` がある。`count` は表の数。 */
  | { readonly kind: "sentence-table"; readonly count: number }
  /** 項目が上限を超える `list` がある。`count` は塊の数。 */
  | { readonly kind: "long-list"; readonly count: number }
  /** `marks` が無く、行数が上限を超える `code` がある。`count` は塊の数。 */
  | { readonly kind: "long-code"; readonly count: number }
  /** `series` の `values` の数が `labels` と揃わない、または `arrow`・`slope`・`span` の `series` が2つでない `chart` の塊がある。`count` は塊の数。 */
  | { readonly kind: "ragged-chart"; readonly count: number }
  /** `stats` の項目の `series` が1〜2個のものがある塊がある。`count` は塊の数。 */
  | { readonly kind: "short-series"; readonly count: number }
  /** 節が2つ以上あるのに見出しの無い節がある。`count` は見出しの無い節の数。 */
  | { readonly kind: "untitled-section"; readonly count: number }
  /**
   * 逃げ道の外側（HTML の塊の中でないところ）に、塊の種類がある記法を書いた。
   * `count` は記法の種類の数、`notations` はその種類。
   */
  | {
      readonly kind: "markdown-notation"
      readonly count: number
      readonly notations: readonly MarkdownNotation[]
    }
  /** `path` を付けた `code` の塊が、そのファイルの中身と一致しない。`paths` は一致しなかった `path`（重複無し）。 */
  | { readonly kind: "code-mismatch"; readonly count: number; readonly paths: readonly string[] }
  /** `code` の塊の `marks` の `lines` が、読めない形かソースの行数の外にある。`count` はその塊の数。 */
  | { readonly kind: "code-marks-range"; readonly count: number }
  /** `mermaid` の塊の構文が割れている。`faults` は位置と字句の名前だけで、図のソースは持たない。 */
  | {
      readonly kind: "broken-mermaid"
      readonly count: number
      readonly faults: readonly MermaidFault[]
    }
  /** `svg` の塊の図形が `width` × `height` の外に出る。`faults` は位置だけで、図形の中身は持たない。 */
  | {
      readonly kind: "broken-svg"
      readonly count: number
      readonly faults: readonly SvgFault[]
    }
  /** `graph` の塊の `source` に読めない行がある。`faults` は位置だけで、書き手の行は持たない。 */
  | {
      readonly kind: "broken-graph"
      readonly count: number
      readonly faults: readonly GraphFault[]
    }
  /** `conclusion` の1文目が全角50字を超える。`count` は1か0、`length` は1文目の字数。 */
  | { readonly kind: "long-first-sentence"; readonly count: number; readonly length: number }
  /** 節の `heading` が30字を超える、または疑問文（末尾が `?`・`？`）。`count` は該当の節の数。 */
  | { readonly kind: "bad-heading"; readonly count: number }
  /** `checks` の `figure` が `数 / 数` の分数に見える。`count` は該当の項目の数。 */
  | { readonly kind: "fraction-figure"; readonly count: number }
  /** `checks` の `unverified` の行の `howToVerify` が空（空白だけを含む）。`count` は該当の行の数。 */
  | { readonly kind: "unverified-without-how"; readonly count: number }
  /** `text` の塊か表のセルに ` → ` がある（インラインコードの中は除く）。`count` は該当の塊の数。 */
  | { readonly kind: "arrow-in-prose"; readonly count: number }
  /** `flow` でない `list` で、`label` の無い項目の `text` が「名前: 説明」で始まる。`count` は該当の項目の数。 */
  | { readonly kind: "label-in-item"; readonly count: number }
  /** 項目が3つ以上の `ordered` の `list` で、全部の項目に `label` がある。`count` は該当の塊の数。 */
  | { readonly kind: "labeled-ordered"; readonly count: number }
  /** `text` の塊か節の見出しが、仮名も漢字も無く英語の語が並ぶ地の文になっている。`count` は該当の数。 */
  | { readonly kind: "non-japanese"; readonly count: number }
  /**
   * `figure` の `none` の理由が本文と合わない。
   * `no-shape` なのに `sections` に流れ・つながり・構造を描く塊（`list` の `flow`・`beforeAfter`・`graph`・`mermaid`・`svg`）がある（`count` はその塊の数）か、
   * `short-answer` なのに節が2つ以上か4文以上の地の文の塊がある（`count` はその節の数と塊の数の和）。
   */
  | {
      readonly kind: "figure-contradiction"
      readonly count: number
      readonly reason: "no-shape" | "short-answer"
    }

/** 違反にしない上限（これを超えたら違反）。 */
export const VIOLATION_THRESHOLDS = {
  "long-conclusion": MAX_CONCLUSION_SENTENCES,
  "long-paragraph": 0,
  "unknown-mermaid": 0,
  "too-many-notes": 2,
  "crowded-notes": 0,
  "nested-fold": 0,
  "too-many-candidates": 0,
  "unordered-options": 0,
  "ragged-table": 0,
  "long-table": 0,
  "sentence-table": 0,
  "long-list": 0,
  "long-code": 0,
  "ragged-chart": 0,
  "short-series": 0,
  "untitled-section": 0,
  "markdown-notation": 0,
  "broken-mermaid": 0,
  "broken-svg": 0,
  "broken-graph": 0,
  "code-mismatch": 0,
  "code-marks-range": 0,
  "long-first-sentence": 0,
  "bad-heading": 0,
  "fraction-figure": 0,
  "unverified-without-how": 0,
  "arrow-in-prose": 0,
  "label-in-item": 0,
  "labeled-ordered": 0,
  "non-japanese": 0,
  "figure-contradiction": 0,
} as const satisfies Record<ReportViolation["kind"], number>

export const REPORT_VIOLATION_KINDS = keys(VIOLATION_THRESHOLDS)
