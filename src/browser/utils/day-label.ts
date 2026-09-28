// 曜日を添えた日付の文字（`9月24日（水）`）を組む。

/** `Temporal.PlainDate.dayOfWeek` は月曜が 1、日曜が 7。 */
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] satisfies readonly string[]

/** `9月24日（水）` の形。年は出さない（要る側は自分で組む）。 */
export function dayLabel(date: Temporal.PlainDate): string {
  const weekday = WEEKDAY_LABELS[date.dayOfWeek - 1] ?? ""
  return `${String(date.month)}月${String(date.day)}日（${weekday}）`
}
