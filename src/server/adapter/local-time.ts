// `~/.tsukumo/` に積む JSONL の「いつ」の書き方。**日の境目も時差もそのマシンのローカル時刻**
// で決める（`docs/design.md` 7章）。
//
// ここが `adapter` にあるのは、読んでいるのが引数の `Date` だけに見えて、実際には**OS の
// タイムゾーン**という外の世界の設定に依っているから（`getTimezoneOffset` / `getHours`）。
// 置き場を日付で分けるファイルが2つ（`chat-archive.ts` / `token-usage-log.ts`）あり、**同じ
// 日の境目で切れていないと後から突き合わせられない**ので、書き方は1箇所に置く。

/** ローカル時刻での `YYYY-MM-DD`（日付ごとのファイルの名前）。 */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
export function isoWithOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const offset = `${sign}${pad(Math.trunc(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`
  const datePart = localDateKey(date)
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return `${datePart}T${timePart}${offset}`
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}
