// ブラウザ側で現在時刻・タイムゾーンを読み、時計の文字を組む場所をここに揃える。
//
// **読んだ値を畳み込みに渡さない**（状態の時刻はサーバが打つ。docs/design.md 4.1）。ここを使う
// のは「いま何ミリ秒経ったか」を画面に出す・記録した時刻を読む人のタイムゾーンで見せるため。

/**
 * いまのエポックミリ秒。**返すのはエポックミリ秒の数**で、`Temporal.Instant` のままでは
 * 返さない — 経過時間の比較と引き算に使う相手（`src/shared/portrait-motion.ts` /
 * `session-state.ts` の `at`）が数の契約だから。
 */
export function nowEpochMilliseconds(): number {
  return Temporal.Now.instant().epochMilliseconds
}

/**
 * OS のタイムゾーン（IANA の名前）。雑談のログが日の境目と行ごとの時刻を決めるのに使う
 * （docs/screen-design.md 13.7「時刻と日の区切り」）。時計ではないが、読む先が同じ「外の世界の設定」
 * なので、ブラウザ側で読む場所をここに揃える。
 */
export function localTimeZoneId(): string {
  return Temporal.Now.timeZoneId()
}

/**
 * エポックミリ秒を、指定したタイムゾーンの日時にする。タイムゾーンを読む場所は
 * 呼び出し側（{@link localTimeZoneId}）に任せる — ここは変換だけを持つ。
 */
export function zonedDateTime(epochMilliseconds: number, timeZone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toZonedDateTimeISO(timeZone)
}

/** 分単位に丸めた時刻（`HH:MM`。秒は出さない）。 */
export function clockTime(at: Temporal.ZonedDateTime): string {
  return at.toPlainTime().toString({ smallestUnit: "minute" })
}

/**
 * 分単位に丸めた ISO 8601 の日時（`<time>` 要素の `dateTime` 属性用。タイムゾーン名は出さない）。
 */
export function clockDateTime(at: Temporal.ZonedDateTime): string {
  return at.toString({ timeZoneName: "never", smallestUnit: "minute" })
}
