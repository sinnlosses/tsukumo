// 時刻の帯と、経過の帯の切り方。
// 帯の境目だけを持ち、利用者やモデルへ見せる語の選び方は読む側が持つ（経過の帯の語は境目と対で決まっているのでここに置く）。

/** 時刻の帯の種類。 */
export type TimeBand = "late-night" | "morning" | "daytime" | "evening" | "night"

/** 時（0〜23）を時刻の帯にする。境目は 5・10・16・19 時。 */
export function timeBandOf(hour: number): TimeBand {
  if (hour < 5) {
    return "late-night"
  }
  if (hour < 10) {
    return "morning"
  }
  if (hour < 16) {
    return "daytime"
  }
  if (hour < 19) {
    return "evening"
  }
  return "night"
}

/**
 * 経過の帯の境目。経過がこのミリ秒未満なら、その語にする（上から先に当たったもの）。
 * どれにも当たらなければ {@link LONG_AWAY_BAND}。
 */
const AWAY_BANDS = [
  { belowMs: 3_600_000, band: "1時間たらず" },
  { belowMs: 21_600_000, band: "数時間" },
  { belowMs: 86_400_000, band: "半日から1日" },
  { belowMs: 604_800_000, band: "数日" },
] as const satisfies readonly { readonly belowMs: number; readonly band: string }[]

const LONG_AWAY_BAND = "1週間以上"

/** 経過の帯の語。 */
export type AwayBand = (typeof AWAY_BANDS)[number]["band"] | typeof LONG_AWAY_BAND

/** 経過（ミリ秒）を帯の語にする。 */
export function awayBandOf(elapsedMs: number): AwayBand {
  return AWAY_BANDS.find((entry) => elapsedMs < entry.belowMs)?.band ?? LONG_AWAY_BAND
}
