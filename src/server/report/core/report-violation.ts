// `report` ツールで受け取ったレポートの検査に使う、規約違反の種類・上限。

import { keys } from "remeda"

import { MAX_CONCLUSION_SENTENCES } from "../../../shared/report/report-limit.ts"
import type { MarkdownNotation } from "./report-markdown-notation.ts"
import type { TemplateMiss } from "./request-template.ts"
import type { FigureViolation } from "./rules/figure.ts"

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
  | FigureViolation
  /** `conclusion` が3要素以上ある（「結論は `conclusion` に1〜2文で書く」）。 */
  | { readonly kind: "long-conclusion"; readonly count: number }
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
   * 結論・`text` の塊・`list` の項目・`table` のセルに、行内の印の書式に当たらない `{{` がある。
   * `count` はその `{{` の数で、本文の字は持たない。
   */
  | { readonly kind: "broken-inline-mark"; readonly count: number }
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
