// `report` ツールで受け取ったレポートの検査に使う、検査にかけるレポートの形と、規約違反の種類・上限。

import { keys } from "remeda"

import type { FigureHardRuleName } from "../../../shared/report/figure-decision.ts"
import type { KeyFigures } from "../../../shared/report/report-block-comparison.ts"
import type { RecordedReportFigure, ReportSection } from "../../../shared/report/report-block.ts"
import type { ReportCheck } from "../../../shared/report/report-check.ts"
import { MAX_CONCLUSION_SENTENCES } from "../../../shared/report/report-limit.ts"
import type { ReportRetrospective } from "../../../shared/report/report-retrospective.ts"
import type { ReportTask } from "../../../shared/report/report-task.ts"
import type { WorkPlanClosing } from "../../../shared/session/work-plan.ts"
import type { FigureNumberFault } from "./figure-number-fault.ts"
import type { GraphFault, SvgFault, ToneFault } from "./report-figure-fault.ts"
import type { MarkdownNotation } from "./report-markdown-notation.ts"
import type { TimelineBlockFault } from "./timeline-fault.ts"

/** 検査にかけるレポート。`sections` と `checks` の「無い」は空の配列、`favor` の「無い」は空の文字列。 */
export type ReportDraft = {
  readonly conclusion: string
  /** `conclusion` の要素ごとの字数（`ParsedConclusion`）。 */
  readonly conclusionSentenceChars: readonly number[]
  /** 結論の直下に並べる数。「無い」は空の配列。 */
  readonly keyFigures: KeyFigures
  readonly figure: RecordedReportFigure
  readonly sections: readonly ReportSection[]
  /** 図の検査（`svg`・`graph`・`timeline`・`mermaid` など）は、振り返りの塊も `sections` と同じに読む。 */
  readonly retrospective: ReportRetrospective
  readonly favor: string
  readonly checks: readonly ReportCheck[]
  /** `code` の塊の `path` → 読めたファイルの中身。読めなかった `path` は入らない。 */
  readonly fileContents: ReadonlyMap<string, string>
  /** 載せたタスク。記法の検査には使わず、段の残りの差し戻し（`ReportReview`）が終わり方を読む。 */
  readonly task: ReportTask
  /** 段の閉じ方。記法の検査には使わず、段の閉じ方の差し戻し（`ReportReview`）が読む。 */
  readonly workPlanClosing: WorkPlanClosing
}

/** 差し戻す `cards` の塊の、塊の並びでの 1 始まりの位置と項目数。`unlabeled` は `label` の空の項目があること。 */
export type CardsFault = {
  readonly position: number
  readonly itemCount: number
  readonly unlabeled: boolean
}

/**
 * 規約違反1つ。`count` は違反の数（文の数・塊の数）で、モデルが書いた文面は持たない
 * （差し戻しの文面に写さないため。会話の中身をモデルの文脈へ戻す経路を作らない）。
 * `code-mismatch` の `paths` は `code` の塊の `path`（schema が決めた識別子で、書いた自由文ではない）。
 */
export type ReportViolation =
  /** `conclusion` が3要素以上ある（「結論は `conclusion` に1〜2文で書く」）。 */
  | { readonly kind: "long-conclusion"; readonly count: number }
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
  /** 候補が採る → 検討 → 採らないの順に並んでいない `options` の塊がある。`count` は塊の数。 */
  | { readonly kind: "unordered-options"; readonly count: number }
  /** 行のセルの数が `columns` と揃わない表がある。`count` は表の数。 */
  | { readonly kind: "ragged-table"; readonly count: number }
  /** 行が上限を超えるのに `rest` が空の `table` がある。`count` は表の数。 */
  | { readonly kind: "long-table"; readonly count: number }
  /** 強調の行（`emphasis`）が上限を超える `table` がある。`count` は表の数。 */
  | { readonly kind: "many-emphasis-rows"; readonly count: number }
  /** 行が2つ以上で、ある列のセルの平均が全角 `SENTENCE_CELL_LENGTH` 字以上の `table` がある（インラインコードとリンクの URL は数えない）。`count` は表の数。 */
  | { readonly kind: "sentence-table"; readonly count: number }
  /** 項目が上限を超える `list` がある。`count` は塊の数。 */
  | { readonly kind: "long-list"; readonly count: number }
  /** `cards` の `list` の項目が 2〜4 の外、または `label` の空の項目がある。`faults` は塊の並びでの位置と項目数。 */
  | {
      readonly kind: "bad-cards"
      readonly count: number
      readonly faults: readonly CardsFault[]
    }
  /** `marks` が無く、行数が上限を超える `code` がある。`count` は塊の数。 */
  | { readonly kind: "long-code"; readonly count: number }
  /** `series` の `values` の数が `labels` と揃わない、または `arrow`・`slope`・`span` の `series` が2つでない `chart` の塊がある。`count` は塊の数。 */
  | { readonly kind: "ragged-chart"; readonly count: number }
  /** `emphasis` に `labels` に無い名前がある `chart` の塊がある。`count` は塊の数。 */
  | { readonly kind: "unknown-emphasis"; readonly count: number }
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
  /** `beforeAfter` の画像の側の `region` が画像の外に出る、または幅か高さが 0 以下。`count` はその塊の数。 */
  | { readonly kind: "region-range"; readonly count: number }
  /** `svg` の塊の図形が `width` × `height` の外に出る。`faults` は位置だけで、図形の中身は持たない。 */
  | {
      readonly kind: "broken-svg"
      readonly count: number
      readonly faults: readonly SvgFault[]
    }
  /** `svg` の塊の `rect` の `tone` が `legend` に無い。`faults` は位置と `tone` の名前だけ。 */
  | {
      readonly kind: "unlegended-svg-tone"
      readonly count: number
      readonly faults: readonly ToneFault[]
    }
  /** `graph` の塊の ` @a`〜` @e` の色の目印が `legend` に無い。`faults` は位置と `tone` の名前だけ。 */
  | {
      readonly kind: "unlegended-graph-tone"
      readonly count: number
      readonly faults: readonly ToneFault[]
    }
  /** `graph` の塊の `source` に読めない行がある。`faults` は位置だけで、書き手の行は持たない。 */
  | {
      readonly kind: "broken-graph"
      readonly count: number
      readonly faults: readonly GraphFault[]
    }
  /** `timeline` の塊の時刻が読めない・尺度が混ざる・昇順でない・終了が開始より前・`emphasis` が行に無い。`faults` は位置と理由だけで、行の名前と時刻の字は持たない。 */
  | {
      readonly kind: "broken-timeline"
      readonly count: number
      readonly faults: readonly TimelineBlockFault[]
    }
  /** `conclusion` の1要素目が全角50字を超える。`count` は1か0、`length` は1要素目の字数。 */
  | { readonly kind: "long-first-sentence"; readonly count: number; readonly length: number }
  /** 節の `heading` が30字を超える、または疑問文（末尾が `?`・`？`）。`count` は該当の節の数。 */
  | { readonly kind: "bad-heading"; readonly count: number }
  /** `checks` の `unobserved` の行の `howToVerify` が空（空白だけを含む）。`count` は該当の行の数。 */
  | { readonly kind: "unobserved-without-how"; readonly count: number }
  /** `text` の塊か表のセルに ` → ` がある（インラインコードの中は除く）。`count` は該当の塊の数。 */
  | { readonly kind: "arrow-in-prose"; readonly count: number }
  /** `flow` でない `list` で、`label` の無い項目の `text` が「名前: 説明」で始まる。`count` は該当の項目の数。 */
  | { readonly kind: "label-in-item"; readonly count: number }
  /** 項目が3つ以上の `ordered` の `list` で、全部の項目に `label` がある。`count` は該当の塊の数。 */
  | { readonly kind: "labeled-ordered"; readonly count: number }
  /** `text` の塊が、仮名も漢字も無く英語の語が並ぶ地の文になっている。`count` は該当の数。 */
  | { readonly kind: "non-japanese"; readonly count: number }
  /** 地の文に、言い換え表（`PLAIN_WORDS`）の語がある。`spellings` は見つけた表の綴りで、書いた文面は持たない。 */
  | {
      readonly kind: "plain-word"
      readonly count: number
      readonly spellings: readonly string[]
    }
  /**
   * `src/browser/` の `.tsx` か `.css` を `added` / `modified` に持つ `files` があるのに、`image` の塊も `beforeAfter` の `image` の側も無く、
   * `checks` に `unobserved`・`blocked` の行も無い。`count` は1か0。
   */
  | { readonly kind: "browser-change-without-image"; readonly count: number }
  /**
   * `figure` の `none` の理由が本文と合わない。
   * `no-shape` なのに `sections` に流れ・つながり・構造を描く塊（`list` の `flow`・`beforeAfter`・`graph`・`mermaid`・`svg`）がある（`count` はその塊の数）か、
   * `short-answer` なのに節が2つ以上ある（`count` はその節の数）。
   */
  | {
      readonly kind: "figure-contradiction"
      readonly count: number
      readonly reason: "no-shape" | "short-answer"
    }
  /**
   * 本文（`conclusion`・`keyFigures`・節の `text`）の数が、どの `plot` の `Q` 列の値とも一致せず、ある列の値と取り違えた形（近い値・桁の単位違い）をしている。
   * `faults` は位置だけで、本文の字も列の名前も持たない。
   */
  | {
      readonly kind: "figure-number-mismatch"
      readonly count: number
      readonly faults: readonly FigureNumberFault[]
    }
  /**
   * `plot` の `form` が置いてはならない形（`FIGURE_HARD_RULES`）に当たり、決定表の形で描いた。
   * `rules` は当たった `plot` ごとの規則の名前。
   */
  | {
      readonly kind: "plot-forbidden-form"
      readonly count: number
      readonly rules: readonly FigureHardRuleName[]
    }
  /** `plot` の `form` が、どちらの図の既定で決めた形とも違い、上書きとして通した。 */
  | { readonly kind: "plot-form-override"; readonly count: number }
  /**
   * 結論・`text` の塊・`list` の項目・`table` のセルに、行内の印の書式に当たらない `{{` がある。
   * `count` はその `{{` の数で、本文の字は持たない。
   */
  | { readonly kind: "broken-inline-mark"; readonly count: number }
  /** 棒・折れ線・円で描く `plot` の題に数が無い。 */
  | { readonly kind: "plot-title-without-number"; readonly count: number }

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
  "browser-change-without-image": 0,
  "figure-contradiction": 0,
  "figure-number-mismatch": 0,
  "plot-forbidden-form": 0,
  "plot-form-override": 0,
  "broken-inline-mark": 0,
  "plot-title-without-number": 0,
} as const satisfies Record<ReportViolation["kind"], number>

export const REPORT_VIOLATION_KINDS = keys(VIOLATION_THRESHOLDS)
