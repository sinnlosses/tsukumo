// `~/.tsukumo/` に積む JSONL の「いつ」の書き方。日の境目も時差もそのマシンのローカル時刻で決める。
//
// 引数のエポックミリ秒だけを読むように見えて、OS のタイムゾーン（`Temporal.Now.timeZoneId()`）に依っている。
// 置き場を日付で分けるファイルが複数あり、同じ日の境目で切れていないと後から突き合わせられないので、書き方はここに1つだけ置く。
// 素通しに見えても呼び出し側へ畳まない。`Temporal.Now` が散ると、日の境目の決め方が複数箇所に分かれる。

/**
 * サーバの時計（いまのエポックミリ秒を返す関数）。サーバで「いま」を読むのはここだけ（検査が縛る）。
 * `fixed`（`TSUKUMO_FIXED_CLOCK`）があれば、その瞬間で止まった進まない時計を返す。
 * 日付キー（{@link todayLocalDateKey}）は凍らせない。
 */
export function createServerClock(fixed: Temporal.Instant | undefined): () => number {
  if (fixed !== undefined) {
    const frozen = fixed.epochMilliseconds
    return () => frozen
  }
  return () => Temporal.Now.instant().epochMilliseconds
}

/** ローカル時刻での `YYYY-MM-DD`（日付ごとのファイルの名前）。 */
export function localDateKey(epochMilliseconds: number): string {
  return localTimeAt(epochMilliseconds).toPlainDate().toString()
}

/** 今日のローカル日付（`YYYY-MM-DD`）。時計を読むのはここだけ。 */
export function todayLocalDateKey(): string {
  return Temporal.Now.plainDateISO().toString()
}

/**
 * 日付キー（`YYYY-MM-DD`）が指すローカルの日の、始まりと終わり（エポックミリ秒。終わりは次の日の始まりで、含まない）。
 * 時計は読まない。
 * 呼ぶ側は検証済みの日付キーを渡す（壊れた値だと投げる）。
 */
export function localDateEpochRange(dateKey: string): {
  readonly startEpochMilliseconds: number
  readonly endEpochMilliseconds: number
} {
  const zone = Temporal.Now.timeZoneId()
  const date = Temporal.PlainDate.from(dateKey)
  return {
    startEpochMilliseconds: date.toZonedDateTime(zone).epochMilliseconds,
    endEpochMilliseconds: date.add({ days: 1 }).toZonedDateTime(zone).epochMilliseconds,
  }
}

/** ローカル時刻の `HH:MM`（日付は含めない）。 */
export function localTimeHHMM(epochMilliseconds: number): string {
  return localTimeAt(epochMilliseconds).toPlainTime().toString({ smallestUnit: "minute" })
}

/** ローカル時刻の月・曜日（1 が月曜、7 が日曜）・時。 */
export function localCalendarAt(epochMilliseconds: number): {
  readonly month: number
  readonly dayOfWeek: number
  readonly hour: number
} {
  const local = localTimeAt(epochMilliseconds)
  return { month: local.month, dayOfWeek: local.dayOfWeek, hour: local.hour }
}

/** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
export function isoWithOffset(epochMilliseconds: number): string {
  // 秒より下は書かない（既に積んだ行と同じ書式を保つ）。
  // `fractionalSecondDigits` の既定は、ミリ秒が残るとそれを書いてしまう。
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
