// 測った経過時間の形と、経過秒を読む文字列にする書式。

/** 測った経過時間。測れなかったときは `unknown`。 */
export type MeasuredTime =
  | { readonly kind: "known"; readonly milliseconds: number }
  | { readonly kind: "unknown" }

const ZERO = { kind: "known", milliseconds: 0 } as const satisfies MeasuredTime

/** 区間の足し算。区間が無いか、1つでも `unknown` なら `unknown`。 */
export function totalOf(durations: readonly MeasuredTime[]): MeasuredTime {
  if (durations.length === 0) {
    return { kind: "unknown" }
  }
  return durations.reduce<MeasuredTime>(sumOf, ZERO)
}

/** 2つの経過時間の足し算。どちらかが `unknown` なら `unknown`。 */
export function sumOf(left: MeasuredTime, right: MeasuredTime): MeasuredTime {
  return left.kind === "known" && right.kind === "known"
    ? { kind: "known", milliseconds: left.milliseconds + right.milliseconds }
    : { kind: "unknown" }
}

/** 測った経過時間を表示用の文字列にする。測れなかったら「不明」。 */
export function formatMeasured(time: MeasuredTime): string {
  return time.kind === "known" ? formatElapsed(Math.round(time.milliseconds / 1000)) : "不明"
}

/** 秒数を「M:SS」の形にする（分は 60 を超えても繰り上げない）。秒への丸めは呼ぶ側が持つ。 */
export function formatMinutesSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  return `${String(minutes)}:${String(totalSeconds % 60).padStart(2, "0")}`
}

/** 秒数を表示用の文字列にする（60秒未満は `N秒`、以降は `M分SS秒`）。 */
export function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${String(totalSeconds)}秒`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes)}分${String(seconds).padStart(2, "0")}秒`
}
