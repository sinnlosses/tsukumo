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
 * `note` 以外の印のうち、tsukumo が塊から組むもの（表のセルの状態の印と変化・数の棒・`matrix` / `compare` / `beforeAfter` / `dimension` の塊・`image` の説明の並び・図と表の題の包みと題の行・`stats` の塊・
 * 名前付きの `list`・`list` の `flow`・`progress` / `options` / `files` の塊）と、
 * 塊にする前にモデルが逃げ道に書いていた `cols` / `card`。モデルには教えない。ラベルは付かず、見た目だけを持つ。
 */
export const REPORT_BLOCK_MARK_NAMES = [
  "cols",
  "card",
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
  "cell-status-none",
  "table-status-legend",
  "table-status-legend-item",
  "table-status-legend-swatch",
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
  "before-after",
  "before-after-side",
  "before-after-label",
  "before-after-label-after",
  "before-after-arrow",
  "dimension",
  "dimension-part",
  "dimension-name",
  "dimension-gap",
  "dimension-band",
  "dimension-value",
  "dimension-before",
  "image-notes",
  "image-note-list",
  "image-note-number",
  "image-note-text",
  "captioned",
  "captioned-fit",
  "caption",
  "caption-number",
  "caption-text",
  "options",
  "option",
  "option-number",
  "option-adopt",
  "option-reject",
  "files",
  "files-summary",
  "file",
  "file-change",
  "file-change-added",
  "file-change-modified",
  "file-change-deleted",
  "file-change-read",
  "file-change-symbol",
  "file-path-folder",
  "file-path-name",
  "file-note",
  "file-note-empty",
] as const satisfies readonly string[]

/** 語彙が挙げる印の名前の全体（`note` の6種 + それ以外）。 */
export const REPORT_NOTATION_NAMES = [
  ...REPORT_NOTE_KINDS.map(([name]) => name),
  ...REPORT_BLOCK_MARK_NAMES,
] satisfies readonly string[]

/**
 * tsukumo が `report` の欄から組む印（モデルには教えないので、文面に書き足す決まりの外）。
 * `verdict` は結論のすぐ下の合図の行（検証結果の判定だけを運ぶ）。
 * `checks` は検証結果の塊で、`checks-ok` / `checks-ng` / `checks-unverified` が状態（左の色罫）。
 * `checks-heading` は小見出し「検証」、`checks-verdict-word` がその右の判定の一言。
 * `checks-body` の中は、全部 ok なら一覧（`check` がその1行）、
 * ng / unverified があれば問題の項目（`checks-problem`）と通った項目の小さな札（`checks-passed-chip`）。
 * `phase-times` は検証結果の下の段ごとの所要時間の横棒グラフで、`phase-time` がその1行
 * （`phase-time-track` が棒の台、`phase-time-bar` が棒）。`phase-time-group` は段のまとまりの包みで、`phase-time-group-head` がその壁時計の行。
 * `conclusion` は `task` のあるレポートの結論の一文、`conclusion-lead` は `task` の無いレポートの結論。
 * 見た目は語彙と同じく `report-notation.module.css` の `report-<名前>`。
 */
export const REPORT_DRAWN_MARK_NAMES = [
  "verdict",
  "checks",
  "checks-ok",
  "checks-ng",
  "checks-unverified",
  "checks-body",
  "checks-heading",
  "checks-verdict-word",
  "check",
  "check-ok",
  "check-mark",
  "check-label",
  "check-figure",
  "check-time",
  "checks-problem",
  "checks-problem-ng",
  "checks-problem-unverified",
  "checks-problem-head",
  "checks-problem-mark",
  "checks-problem-label",
  "checks-problem-figure",
  "checks-problem-time",
  "checks-problem-detail",
  "checks-passed",
  "checks-passed-chip",
  "checks-passed-chip-mark",
  "phase-times",
  "phase-times-heading",
  "phase-time",
  "phase-time-label",
  "phase-time-track",
  "phase-time-bar",
  "phase-time-value",
  "phase-time-unknown",
  "phase-time-group",
  "phase-time-group-head",
  "conclusion",
  "conclusion-lead",
] as const satisfies readonly string[]
