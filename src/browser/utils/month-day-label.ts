// 「9月23日」の形（曜日は付けない）。`Temporal` だけで書ける言語標準の道具で、3つの機能
// （成果の画面の日記帳の見開き・帯の「いまの作業」・書き終わりの知らせ）が読むので `utils/` に
// 置く（docs/design.md 2章「`lib/` と `utils/` に置く基準」。上げる引き金は「2つ目の読み手が
// 出たとき」）。曜日を添える `day-label.ts` とは別の形が要る場面（前後の送りのボタン・
// 書き終わりの知らせ）のためのもの。

/** `9月23日` の形。年は出さない（要る側は自分で組む）。 */
export function monthDayLabel(date: Temporal.PlainDate): string {
  return `${String(date.month)}月${String(date.day)}日`
}
