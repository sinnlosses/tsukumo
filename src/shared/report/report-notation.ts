// レポートの記法（モデルが書く class 名）の語彙。印の名前の集合の出どころはここだけで、
// 画面の対応表（`src/browser/components/page/conversation/components/main-view/markdown/notation.tsx`）はここから引く。
//
// 印は2通りの出どころを持つ。モデルが逃げ道（`markdown` の塊）に書く印（`REPORT_WRITTEN_MARK_NAMES`）と、
// tsukumo が塊から組む印（`note` の6種と `REPORT_BLOCK_MARK_NAMES`。組むのは `reportSectionsMarkdown`）。
// 塊から組む印も、塊にする前の記録ではモデルが書いていたので、描く側は両方を同じに解決する。
//
// claude に教える文面（`src/server/report/core/report-notation.ts` の `REPORT_NOTATION_PROMPT`）は
// ここから組み立てず、手で書く。 逃げ道に書く印を足すときは文面にも書き足す必要があり、書き忘れは
// `test/server/report/core/report-notation.test.ts` が落とす。見た目は `report-notation.module.css` の
// `report-<名前>` で、これも同じテストが見張る。

/**
 * `note` の種別。記法の class 名 → tsukumo が文字として描くラベル。並びは種別を
 * 言っている側から素の `note` の順（`class="note note-warn"` のように種別と素の `note` を
 * 並べて書くので、種別を言っているほうを先に見つける。素の `note` は「情報」の受け皿なので
 * 最後）。
 */
export const REPORT_NOTE_KINDS = [
  ["note-warn", "注意"],
  ["note-ng", "異常"],
  ["note-ask", "疑問"],
  ["note-memo", "メモ"],
  ["note-favor", "お願い"],
  ["note", "情報"],
] as const satisfies readonly (readonly [name: string, label: string])[]

/** `note` 以外の印のうち、モデルが逃げ道に書くもの。ラベルは付かず、見た目（CSS の `report-<name>`）だけを持つ。 */
export const REPORT_WRITTEN_MARK_NAMES = ["cols", "card"] as const satisfies readonly string[]

/**
 * `note` 以外の印のうち、tsukumo が塊から組むもの（表のセルの状態のバッジと変化・`stats` の塊・
 * 名前付きの `list`・`list` の `flow`・`progress` の塊）。モデルには教えない。ラベルは付かず、見た目だけを持つ。
 */
export const REPORT_BLOCK_MARK_NAMES = [
  "badge",
  "badge-ok",
  "badge-warn",
  "badge-ng",
  "change-from",
  "stats",
  "stat",
  "stat-before",
  "labeled-list",
  "list-label",
  "list-text",
  "flow",
  "flow-step",
  "flow-arrow",
  "progress",
  "progress-step",
  "progress-step-done",
  "progress-step-current",
] as const satisfies readonly string[]

/** 語彙が挙げる印の名前の全体（`note` の6種 + それ以外）。 */
export const REPORT_NOTATION_NAMES = [
  ...REPORT_NOTE_KINDS.map(([name]) => name),
  ...REPORT_WRITTEN_MARK_NAMES,
  ...REPORT_BLOCK_MARK_NAMES,
] satisfies readonly string[]

/**
 * tsukumo が `report` の欄から組む印（モデルには教えない。文面に載せないので、上の語彙の
 * 「文面にも書く」決まりの外）。`checks` は検証結果の帯、`check` はその1項目で、組むのは
 * `src/shared/report/report-check.ts`。見た目は語彙と同じく `report-notation.module.css` の `report-<名前>`。
 */
export const REPORT_DRAWN_MARK_NAMES = ["checks", "check"] as const satisfies readonly string[]
