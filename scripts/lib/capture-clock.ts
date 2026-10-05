// 偽の時計を入れたページで、`Temporal.Now` も `Date.now()` に従わせる初期化台本。
// `page.clock.install` だけでは `Temporal.Now` は差し替わらない。

export const TEMPORAL_FOLLOWS_DATE_SCRIPT =
  "Temporal.Now.instant = () => Temporal.Instant.fromEpochMilliseconds(Date.now())"
