// ブラウザ側で現在時刻を読む唯一の場所。**返すのはエポックミリ秒の数**で、`Temporal.Instant`
// のままでは返さない — 経過時間の比較と引き算に使う相手（`src/shared/portrait-motion.ts` /
// `session-state.ts` の `at`）が数の契約だから。
//
// **読んだ値を畳み込みに渡さない**（状態の時刻はサーバが打つ。docs/design.md 4.1）。ここを使う
// のは「いま何ミリ秒経ったか」を画面に出すため。

/** いまのエポックミリ秒。 */
export function nowEpochMilliseconds(): number {
  return Temporal.Now.instant().epochMilliseconds
}

/**
 * OS のタイムゾーン（IANA の名前）。雑談のログが日の境目と行ごとの時刻を決めるのに使う
 * （docs/design.md 13.7「時刻と日の区切り」）。時計ではないが、読む先が同じ「外の世界の設定」
 * なので、ブラウザ側で読む場所をここに揃える。
 */
export function localTimeZoneId(): string {
  return Temporal.Now.timeZoneId()
}
