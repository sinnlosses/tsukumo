// 偽の時計を入れたページで、`Temporal.Now` も `Date.now()` に従わせる初期化台本。
// `page.clock.install` だけでは `Temporal.Now` は差し替わらない。

export const TEMPORAL_FOLLOWS_DATE_SCRIPT =
  "Temporal.Now.instant = () => Temporal.Instant.fromEpochMilliseconds(Date.now())"

/** `--clock` の値（オフセット付きの ISO 時刻）をエポックミリ秒に読む。読めなければ undefined。 */
export function readClockInstant(value: string): number | undefined {
  try {
    return Temporal.Instant.from(value).epochMilliseconds
  } catch {
    return undefined
  }
}
