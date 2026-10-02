// レポートの記法（モデルが書く class 名）の語彙。印の名前の集合の出どころはここだけ。
//
// 印は tsukumo が塊から組むもの（`note` の6種と `REPORT_BLOCK_MARK_NAMES`）。
// 塊にする前の記録ではモデルが書いていたものも含むので、描く側は同じに解決する。
//
// claude に教える文面（`REPORT_NOTATION_PROMPT`）はここから組み立てず、手で書く。
// 印を足すときは見た目（`report-notation.module.css` の `report-<名前>`）にも書き足す（書き忘れはテストが落とす）。

/**
 * `note` の種別。記法の class 名 → tsukumo が文字として描くラベル。
 * 並びは種別を言っている側から素の `note` の順（`class="note note-warn"` のように種別と素の `note` を並べて書くので、種別を言っているほうを先に見つける。素の `note` は「情報」の受け皿なので最後）。
 */
export const REPORT_NOTE_KINDS = [
  ["note-warn", "注意"],
  ["note-ng", "異常"],
  ["note-ask", "疑問"],
  ["note-memo", "メモ"],
  ["note-favor", "お願い"],
  ["note", "情報"],
] as const satisfies readonly (readonly [name: string, label: string])[]

/**
 * `note` 以外の印のうち、tsukumo が塊から組むもの（表のセルの状態の印と変化・数の棒・`matrix` / `compare` / `dimension` / `image` の塊・`stats` の塊・
 * 名前付きの `list`・`list` の `flow`・`progress` / `options` / `files` の塊）と、
 * 塊にする前にモデルが逃げ道に書いていた `cols` / `card`。モデルには教えない。ラベルは付かず、見た目だけを持つ。
 */
export const REPORT_BLOCK_MARK_NAMES = [
  "cols",
  "card",
  "table-title",
  "badge",
  "badge-ok",
  "badge-warn",
  "badge-ng",
  "change-from",
  "cell-status",
  "cell-status-ok",
  "cell-status-warn",
  "cell-status-ng",
  "cell-status-mark",
  "cell-status-text",
  "cell-numeric",
  "cell-bar",
  "cell-numeric-value",
  "matrix",
  "matrix-mark",
  "matrix-mark-ok",
  "matrix-mark-warn",
  "matrix-mark-ng",
  "matrix-mark-na",
  "matrix-legend",
  "matrix-legend-item",
  "stats",
  "stat",
  "stat-before",
  "stat-total",
  "stat-meter",
  "stat-meter-fill",
  "labeled-list",
  "list-label",
  "list-text",
  "flow",
  "flow-step",
  "flow-number",
  "flow-rail",
  "progress",
  "progress-step",
  "progress-step-done",
  "progress-step-current",
  "progress-dot",
  "progress-dot-mark",
  "progress-name",
  "progress-status",
  "progress-line",
  "progress-line-done",
  "status",
  "compare",
  "compare-side",
  "compare-heading",
  "dimension",
  "dimension-part",
  "dimension-name",
  "dimension-gap",
  "dimension-band",
  "dimension-value",
  "dimension-before",
  "image",
  "image-caption",
  "image-caption-number",
  "image-caption-text",
  "options",
  "option",
  "option-adopt",
  "option-reject",
  "files",
  "file",
  "file-change",
  "file-note",
] as const satisfies readonly string[]

/** 語彙が挙げる印の名前の全体（`note` の6種 + それ以外）。 */
export const REPORT_NOTATION_NAMES = [
  ...REPORT_NOTE_KINDS.map(([name]) => name),
  ...REPORT_BLOCK_MARK_NAMES,
] satisfies readonly string[]

/**
 * tsukumo が `report` の欄から組む印（モデルには教えないので、文面に書き足す決まりの外）。
 * `checks` は検証結果の表、`check` はその1行で、ほかの `check-` は行の中の部位と状態の色。
 * `conclusion` は `task` のあるレポートの結論の一文。
 * 見た目は語彙と同じく `report-notation.module.css` の `report-<名前>`。
 */
export const REPORT_DRAWN_MARK_NAMES = [
  "checks",
  "checks-summary",
  "checks-summary-count",
  "checks-summary-ok",
  "checks-summary-ng",
  "checks-summary-warn",
  "check",
  "check-ok",
  "check-ng",
  "check-unverified",
  "check-mark",
  "check-label",
  "check-figure",
  "check-time",
  "check-body",
  "conclusion",
] as const satisfies readonly string[]
