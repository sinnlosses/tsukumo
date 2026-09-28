// 「9月23日」の形（曜日は付けない）。

/** `9月23日` の形。年は出さない（要る側は自分で組む）。 */
export function monthDayLabel(date: Temporal.PlainDate): string {
  return `${String(date.month)}月${String(date.day)}日`
}
