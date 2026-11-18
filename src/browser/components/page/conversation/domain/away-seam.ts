// 離れていたあいだの記録の形と、線を出すのに足りる長さ。
// 前に見た位置は、ページが隠れた時点の最新のやり取りの流れの行の数で、タブのメモリだけが持つ。

/** これより短く隠れていただけなら線を出さない（タブをすぐ切り替えて戻っただけの回のため）。 */
const MIN_AWAY_MS = 30_000

/** 戻ったときに取り出す、離れていたあいだの記録。 */
export type Away = {
  readonly generation: number
  readonly turnId: number
  /** 隠れた時点の、そのやり取りの流れの行の数。これより後ろの行が新しい。 */
  readonly rowCount: number
  /** 隠れた時点と見えた時点の、済んだ区間の数。この間に済んだ区間が、隠れていたあいだに済んだ区間。 */
  readonly hiddenDoneSegments: number
  readonly visibleDoneSegments: number
  readonly awayMs: number
}

/** 隠れていた時間が線を出すのに足りるか。 */
export function awayLongEnough(awayMs: number): boolean {
  return awayMs >= MIN_AWAY_MS
}
