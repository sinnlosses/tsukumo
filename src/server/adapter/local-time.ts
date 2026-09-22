// `~/.tsukumo/` に積む JSONL の「いつ」の書き方。**日の境目も時差もそのマシンのローカル時刻**
// で決める（`docs/design.md` 7章）。
//
// ここが `adapter` にあるのは、読んでいるのが引数のエポックミリ秒だけに見えて、実際には**OS の
// タイムゾーン**という外の世界の設定に依っているから（`Temporal.Now.timeZoneId()`）。
// 置き場を日付で分けるファイルが2つ（`chat-archive.ts` / `token-usage-log.ts`）あり、**同じ
// 日の境目で切れていないと後から突き合わせられない**ので、書き方は1箇所に置く。
//
// **素通しに見えても畳まない。** `Temporal` なら日付キーもオフセット付きの ISO も1行で出るが、
// OS のタイムゾーンを読む場所を1つに保つほうを採る（呼び出し側に `Temporal.Now` が散ると、
// 日の境目の決め方が複数箇所に分かれる）。
//
// 受け取るのは**エポックミリ秒の数**。畳み込みが持つ時刻がその形（`StampedEvent.at`）で、
// ここで `Temporal.Instant` に変えても境界をまたぐ型が増えるだけになる。

/** ローカル時刻での `YYYY-MM-DD`（日付ごとのファイルの名前）。 */
export function localDateKey(epochMilliseconds: number): string {
  return localTimeAt(epochMilliseconds).toPlainDate().toString()
}

/** 今日のローカル日付（`YYYY-MM-DD`）。時計を読むのはここだけ。 */
export function todayLocalDateKey(): string {
  return Temporal.Now.plainDateISO().toString()
}

/** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
export function isoWithOffset(epochMilliseconds: number): string {
  // 秒より下は書かない（既に積んだ行と同じ書式を保つ。`fractionalSecondDigits` の既定は
  // ミリ秒が残るとそれを書いてしまう）。
  return localTimeAt(epochMilliseconds).toString({
    timeZoneName: "never",
    fractionalSecondDigits: 0,
  })
}

function localTimeAt(epochMilliseconds: number): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toZonedDateTimeISO(
    Temporal.Now.timeZoneId(),
  )
}
