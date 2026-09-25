// レポートの記法（モデルが書く class 名）の語彙。**印の名前の集合の出どころはここだけ**で、
// 画面の対応表（`src/browser/components/page/conversation/main-view/markdown/notation.tsx`）はここから引く。
//
// **claude に教える文面（`src/server/report/core/report-notation.ts` の `REPORT_NOTATION_PROMPT`）は
// ここから組み立てず、手で書く。** 印を足すときは文面にも書き足す必要があり、書き忘れは
// `test/server/report/core/report-notation.test.ts` が落とす。見た目は `report-notation.module.css` の
// `report-<名前>` で、これも同じテストが見張る。

/**
 * `note` の種別。モデルが書く class 名 → tsukumo が文字として描くラベル。**並びは種別を
 * 言っている側から素の `note` の順**（`class="note note-warn"` のように種別と素の `note` を
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

/** `note` 以外の印。ラベルは付かず、見た目（CSS の `report-<name>`）だけを持つ。 */
export const REPORT_MARK_NAMES = [
  "badge",
  "badge-ok",
  "badge-warn",
  "badge-ng",
  "cols",
  "card",
  "stats",
  "stat",
] as const satisfies readonly string[]

/** 語彙が挙げる印の名前の全体（`note` の6種 + それ以外の8種）。 */
export const REPORT_NOTATION_NAMES = [
  ...REPORT_NOTE_KINDS.map(([name]) => name),
  ...REPORT_MARK_NAMES,
] satisfies readonly string[]
