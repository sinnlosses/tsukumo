// 曜日を添えた日付の文字（`9月24日（水）`）を組む。`Temporal` だけで書ける言語標準の道具で、
// 2つの機能（雑談ビューのログの日の区切り・成果の画面の日の切り替え）が読むので `utils/` に
// 置く（docs/design.md 2章「`lib/` と `utils/` に置く基準」。上げる引き金は「2つ目の読み手が
// 出たとき」）。

/** `Temporal.PlainDate.dayOfWeek` は月曜が 1、日曜が 7。 */
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] satisfies readonly string[]

/** `9月24日（水）` の形。年は出さない（要る側は自分で組む。`components/page/achievement/` など）。 */
export function dayLabel(date: Temporal.PlainDate): string {
  const weekday = WEEKDAY_LABELS[date.dayOfWeek - 1] ?? ""
  return `${String(date.month)}月${String(date.day)}日（${weekday}）`
}
